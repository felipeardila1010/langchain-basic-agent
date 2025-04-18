import * as dotenv from 'dotenv'
dotenv.config()

import { SearchApi } from "@langchain/community/tools/searchapi";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { writeFile } from "fs/promises";

// Define the tools for the agent to use
const agentTools = [new SearchApi(process.env.SEARCHAPI_API_KEY, {
  //engine: "google_news",
})];

// Choose the model
let agentModel;
if(process.env.LLM_IS_LOCAL === 'true') {
  agentModel = new ChatOllama({
    model: "llama3.2",
    baseUrl: "http://localhost:11434",
    temperature: 0,
    maxRetries: 2,
    // other params...
  });
} else {
  agentModel = new ChatOpenAI({ temperature: 0 });
}

// Initialize memory to persist state between graph runs
const agentCheckpointer = new MemorySaver();
const agent = createReactAgent({
  llm: agentModel,
  tools: agentTools,
  checkpointSaver: agentCheckpointer,
});

// Now it's time to use!
const agentFinalState = await agent.invoke(
  { messages: [new HumanMessage("what is the current weather in Colombia")] },
  { configurable: { thread_id: "42" } },
);

console.log('FirstResponse:',
  agentFinalState.messages[agentFinalState.messages.length - 1].content,
);

const agentNextState = await agent.invoke(
  { messages: [new HumanMessage("what about ny")] },
  { configurable: { thread_id: "42" } },
);

console.log('SecondResponse:',
  agentNextState.messages[agentNextState.messages.length - 1].content,
);

// Draw the graph
const graph = agent.getGraph();
const image = await graph.drawMermaidPng();
const arrayBuffer = await image.arrayBuffer();

async function savePngFromArrayBuffer(arrayBuffer: ArrayBuffer, filePath: string) {
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);
  console.log(`File saved in: ${filePath}`);
}

savePngFromArrayBuffer(arrayBuffer, 'graph.png');