import { WebSocketServer } from "ws";
import ServerMaster from "./ServerMaster.js";
const wss = new WebSocketServer({ port: 8080 });

const serverMaster = new ServerMaster();

export const conversationHistory = [];

wss.on("connection", function connection(ws) {
  ws.on("error", console.error);

  ws.on("message", async function message(event) {
    const { type, agentId, data } = JSON.parse(event);

    if (type === "create_agents") {
      console.log(`Creating ${data.quantity} Agents`);

      const agents = await serverMaster.createNPCs(data.quantity);

      ws.send(
        JSON.stringify({
          type: "agents_created",
          success: true,
          data: agents,
          message: `Agents created`,
        })
      );
    } else if (type === "chat") {
      console.log(`newChat for agent: ${agentId}`);
      if (serverMaster.npcs[agentId]) {
        const completion = await serverMaster.npcs[agentId].chat(data.message);

        if (completion instanceof Array) {
          // has tool calls
          completion.forEach((toolCall) => {
            switch (toolCall.function.name) {
              case "endConversation":
                ws.send(
                  JSON.stringify({
                    type: "end_chat",
                    agent_id: agentId,
                    data: JSON.parse(toolCall.function.arguments),
                  })
                );
                break;

              case "followPlayer":
                ws.send(
                  JSON.stringify({
                    type: "follow_player",
                    agent_id: agentId,
                    data: JSON.parse(toolCall.function.arguments),
                  })
                );
                break;

              case "stopFollowPlayer":
                ws.send(
                  JSON.stringify({
                    type: "stop_follow_player",
                    agent_id: agentId,
                    data: JSON.parse(toolCall.function.arguments),
                  })
                );
                break;

              default:
                break;
            }
          });
        } else {
          ws.send(
            JSON.stringify({
              type: "chat_response",
              agent_id: agentId,
              data: completion,
            })
          );
        }
      }
    }
  });
});
