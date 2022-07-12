import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import {
    APIInteraction,
    InteractionResponseType,
    InteractionType,
} from "discord-api-types/v10";
import nacl from "tweetnacl";
import "process";

const PUBLIC_KEY = process.env.PUBLIC_KEY!;

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
    console.log("Event %o", event);
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
        const { name } = body.data;
        if (name === "days") {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: "It has been X days since the last incident.",
                    },
                }),
            };
        } else if (name === "reset") {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content:
                            "Okay. It's now 0 days since the last incident.",
                    },
                }),
            };
        }
    }

    return {
        statusCode: 500,
        body: JSON.stringify({
            message: "Don't know what to do",
        }),
    };
};
