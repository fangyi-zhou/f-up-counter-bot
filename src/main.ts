import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import {
    APIApplicationCommandInteraction,
    APIInteraction,
    InteractionResponseType,
    InteractionType,
} from "discord-api-types/v10";
import nacl from "tweetnacl";
import "process";
import moment from "moment";
import fetch from "node-fetch";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { fromEnv } from "@aws-sdk/credential-providers";
import { v4 as uuid } from "uuid";

// public key for Discord App
const PUBLIC_KEY = process.env.PUBLIC_KEY!;

const DB = new DynamoDB({ credentials: fromEnv() });

async function getLastFUp() {
    console.log("Fetching last incident...");
    const resp = await DB.batchGetItem({
        RequestItems: {
            "last-fup": {
                Keys: [
                    { key: { S: "last-fup-time" } },
                    { key: { S: "last-fup-content" } },
                ],
            },
        },
    });
    let last_time = undefined;
    let last_content = undefined;
    if (resp && resp.Responses) {
        for (const item of resp.Responses["last-fup"]) {
            if (item.key.S === "last-fup-time") last_time = item.value.N;
            if (item.key.S === "last-fup-content") last_content = item.value.S;
        }
    }
    console.log(`Last incident was ${last_content} at ${last_time}`);
    return { last_time, last_content };
}

async function submitFUp(fup_content?: string) {
    console.log("Submitting last incident to database...");
    const fup_time = moment();
    // Set date to the beginning of the day
    fup_time.startOf("day");
    const resp = await DB.batchWriteItem({
        RequestItems: {
            "last-fup": [
                {
                    PutRequest: {
                        Item: {
                            key: { S: "last-fup-time" },
                            value: { N: fup_time.unix().toString() },
                        },
                    },
                },
                {
                    PutRequest: {
                        Item: {
                            key: { S: "last-fup-content" },
                            value: { S: fup_content || "Unknown" },
                        },
                    },
                },
            ],
            "all-fups": [
                {
                    PutRequest: {
                        Item: {
                            "fup-time": { N: fup_time.unix().toString() },
                            "fup-content": { S: fup_content || "Unknown" },
                            hash: { S: uuid() },
                        },
                    },
                },
            ],
        },
    });
    console.log("%o", resp);
}

async function respond(
    interaction_id: string,
    interaction_token: string,
    data: object
) {
    console.log("Sending a reply message...");
    const url = `https://discord.com/api/v10/interactions/${interaction_id}/${interaction_token}/callback`;
    return await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });
}

export const lambdaHandler = async (
    event: APIGatewayEvent,
    context: Context
): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Invalid parameters: Request does not have a body.",
            }),
        };
    }
    // console.log("Event %o", event);
    const signature = event.headers["x-signature-ed25519"]!;
    const timestamp = event.headers["x-signature-timestamp"]!;

    const isVerified = nacl.sign.detached.verify(
        Buffer.from(timestamp + event.body),
        Buffer.from(signature, "hex"),
        Buffer.from(PUBLIC_KEY, "hex")
    );

    if (!isVerified) {
        return {
            statusCode: 401,
            body: JSON.stringify({
                message: "Invalid request signature.",
            }),
        };
    }

    const body = JSON.parse(event.body) as APIInteraction;
    if (body.type === InteractionType.Ping) {
        console.log("Responding to a Ping message...");
        return {
            statusCode: 200,
            body: JSON.stringify({
                type: InteractionResponseType.Pong,
            }),
        };
    } else if (body.type === InteractionType.ApplicationCommand) {
        console.log("Responding to an application command...");
        const { id, token } = body;
        const { name } = (body as APIApplicationCommandInteraction).data;
        if (name === "days") {
            console.log("Processing 'days'...");
            let response =
                "Sorry, the bot is broken, so I guess that means it has been 0 days since the last incident.";
            try {
                const { last_time, last_content } = await getLastFUp();
                if (last_time !== undefined) {
                    const last_fup = moment.unix(parseInt(last_time));
                    const now = moment();
                    now.startOf("day");
                    const days = moment.duration(now.diff(last_fup)).asDays();
                    response = `It has been ${days.toString()} day(s) since the last incident. The last incident was ${last_content}`;
                }
            } catch {}
            await respond(id, token, {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: response,
                },
            });
            console.log("Done. Everything was okay.");
            return { statusCode: 200, body: "Ok." };
        } else if (name === "reset") {
            console.log("Processing 'reset'...");
            let reason;
            // Need to convince typechecker that this first actually may exist
            if ("options" in body.data && body.data.options !== undefined) {
                for (let option of body.data.options) {
                    // Ditto, and asserting that the reason is a string
                    if (option.name === "reason" && "value" in option) {
                        reason = option.value as string;
                        break;
                    }
                }
            }
            await submitFUp(reason);
            await respond(id, token, {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "Okay. It's now 0 days since the last incident.",
                },
            });
            console.log("Done. Everything was okay.");
            return { statusCode: 200, body: "Ok." };
        }
    }

    console.log("I'm confused about what to do.");
    return {
        statusCode: 500,
        body: JSON.stringify({
            message: "Don't know what to do",
        }),
    };
};
