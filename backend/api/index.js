import { OpenAI } from "openai";
import env from "../env.json" assert { type: "json" };
import extract from "extract-json-from-string";

class ApiHandler {
  constructor() {
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      project: env.OPENAI_PROJECT_ID,
    });
  }

  async callChatCompletion(
    prompt,
    attempt,
    history,
    tools,
    functionsResponses
  ) {
    if (attempt > 3) {
      return null;
    }

    if (attempt > 0) {
      prompt = "YOU MUST ONLY RESPOND WITH VALID JSON OBJECTS\n" + prompt;
    }

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [...history, { role: "user", content: prompt }],
      temperature: 1,
      top_p: 1,
      max_tokens: 2000,
      tools,
    });

    const result = response.choices[0];

    history.push(
      ...[
        { role: "user", content: prompt },
        {
          role: "assistant",
          content: response.choices[0].message.content,
          tool_calls: response.choices[0].message.tool_calls,
        },
      ]
    );

    console.log("OpenAI response", response.choices[0].message.content);

    if (
      !response.choices[0].message.content &&
      response.choices[0].message.tool_calls.length > 0
    ) {
      // has tool calls
      history.push({
        role: "tool",
        content: functionsResponses[result.message.tool_calls[0].function.name],
        name: result.message.tool_calls[0].function.name,
        tool_call_id: result.message.tool_calls[0].id,
      });
      return response.choices[0].message.tool_calls;
    }

    const responseObject = this.cleanAndProcess(
      response.choices[0].message.content
    );
    if (responseObject) {
      return responseObject;
    }

    return await this.callChatCompletion(
      prompt,
      attempt + 1,
      history,
      tools,
      functionsResponses
    );
  }

  cleanAndProcess(text) {
    const extractedJson = extract(text)[0];

    if (!extractedJson) {
      return null;
    }

    return extractedJson;
  }
}

export const apiHandler = new ApiHandler();
