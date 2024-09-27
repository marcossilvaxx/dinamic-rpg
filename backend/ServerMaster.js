import { apiHandler } from "./api/index.js";
import { masterStorage } from "./data/MasterStorage.js";
import ServerAgent from "./ServerAgent.js";

class ServerMaster {
  constructor() {
    this.npcs = {};
    this.nextNpcId = 1;
  }

  async createWorld() {
    console.log("Creating world history...");

    try {
      const prompt = `
      # Introduction

      You are a super creative fictional-adventure writter. 
      I want you to create the history of a medieval world with some characters living there. 
      You can create points of interest, places, buildings, characters and so on. Be creative.

      # Responses
      
      You must supply your response in the form of valid JSON object. 
      The key of the object is "worldHistory" and the value is a text with the history. 
      The text shouldn't have more than 1000 words. 
      The following is an example of a valid response:
      
      { worldHistory: "This is the history of the world..." }

      The JSON response indicating the world history is:
      `;

      const completion = await apiHandler.callChatCompletion(prompt, 0, []);

      console.log("completion", completion);

      masterStorage.setWorld(completion);

      return completion;
    } catch (error) {
      console.error("Error processing response:", error);
    }
  }

  async createNPCs(quantity) {
    const npcsCreated = [];

    const world = await this.createWorld();

    for (let i = 0; i < quantity; i++) {
      const newAgent = new ServerAgent(this.nextNpcId);

      const data = await newAgent.initialSetup({
        worldHistory: world.worldHistory,
      });

      console.log(`Agent ${this.nextNpcId} created`);

      this.npcs[this.nextNpcId] = newAgent;

      this.nextNpcId++;

      npcsCreated.push({
        id: newAgent.id,
        data: data,
      });
    }

    return npcsCreated;
  }
}

export default ServerMaster;
