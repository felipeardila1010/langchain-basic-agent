import * as dotenv from 'dotenv'
dotenv.config()

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOllama } from '@langchain/ollama';
import { writeFile } from "fs/promises";

// Define the tools for the agent to use
//const tools = [new TavilySearchResults({ maxResults: 3 })];
const tools = [];
const toolNode = new ToolNode(tools);

// Create a model and give it access to the tools
// Choose the model
let model;
if(process.env.LLM_IS_LOCAL === 'true') {
  console.log('Using local LLM');
  model = new ChatOllama({
    model: "llama3.2",
    baseUrl: "http://localhost:11434",
    temperature: 0,
    maxRetries: 2,
    // other params...
  });
} else {
  console.log('Using OpenAI LLM');
  model = new ChatOpenAI({ temperature: 0 });
}

// Define the function that determines whether to continue or not
function shouldContinue({ messages }: typeof MessagesAnnotation.State) {
  const lastMessage = messages[messages.length - 1] as AIMessage;

  // If the LLM makes a tool call, then we route to the "tools" node
  if (lastMessage.tool_calls?.length) {
    return "tools";
  }
  // Otherwise, we stop (reply to the user) using the special "__end__" node
  return "__end__";
}

// Define the function that calls the model
async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await model.invoke(state.messages);

  // We return a list, because this will get added to the existing list
  return { messages: [response] };
}

// Define a new graph
const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addEdge("__start__", "agent") // __start__ is a special name for the entrypoint
  .addNode("tools", toolNode)
  .addEdge("tools", "agent")
  .addConditionalEdges("agent", shouldContinue);

// Finally, we compile it into a LangChain Runnable.
const app = workflow.compile();

// Use the agent
const finalState = await app.invoke({
  messages: [new HumanMessage("what is the weather in Bogota")],
});
console.log(finalState.messages[finalState.messages.length - 1].content);

const nextState = await app.invoke({
  // Including the messages from the previous run gives the LLM context.
  // This way it knows we're asking about the weather in NY
  messages: [...finalState.messages, new HumanMessage("what about Bogota")],
});
console.log(nextState.messages[nextState.messages.length - 1].content);

// Draw the graph
const graph = app.getGraph();
const image = await graph.drawMermaidPng();
const arrayBuffer = await image.arrayBuffer();

async function savePngFromArrayBuffer(arrayBuffer: ArrayBuffer, filePath: string) {
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);
  console.log(`File saved in: ${filePath}`);
}

savePngFromArrayBuffer(arrayBuffer, 'graph-nodes.png');