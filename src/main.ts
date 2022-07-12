import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import {
    APIInteraction,
    InteractionResponseType,
    InteractionType,
} from "discord-api-types/v10";
import nacl from "tweetnacl";
import "process";
import fetch from "node-fetch";

const PUBLIC_KEY = process.env.PUBLIC_KEY!;

async function respond(
    interaction_id: string,
    interaction_token: string,
    data: object
) {
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
        console.log("Responding to a Ping message");
        return {
            statusCode: 200,
            body: JSON.stringify({
                type: InteractionResponseType.Pong,
            }),
        };
    } else if (body.type === InteractionType.ApplicationCommand) {
        console.log("Responding to an application command");
        const { name } = body.data;
        if (name === "days") {
            console.log("Processing 'days'");
            await respond(body.id, body.token, {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "It has been X days since the last incident.",
                },
            });
            return { statusCode: 200, body: "Ok." };
        } else if (name === "reset") {
            console.log("Processing 'reset'");
            await respond(body.id, body.token, {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "Okay. It's now 0 days since the last incident.",
                },
            });
            return { statusCode: 200, body: "Ok." };
        }
    }

    return {
        statusCode: 500,
        body: JSON.stringify({
            message: "Don't know what to do",
        }),
    };
};
