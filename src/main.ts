import { Context, APIGatewayProxyResult, APIGatewayEvent } from "aws-lambda";
import { APIInteraction, InteractionType } from "discord-api-types/v10";

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
    const body = JSON.parse(event.body) as APIInteraction;
    if (body.type === InteractionType.Ping) {
        console.log("Responding to a Ping message");
        return {
            statusCode: 200,
            body: JSON.stringify({
                type: InteractionType.Ping,
            }),
        };
    }
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "hello world",
        }),
    };
};
