import { Glob } from "bun";
import ollama from "ollama";
import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";

const chunklengths = [50];
const chunkoverlaps = [20];
const client = new QdrantClient({
  url: process.env.QDRANT_HOST || "http://127.0.0.1:6333",
  // Asegúrate de incluir tu API key si tu instancia de Qdrant la requiere
  apiKey: process.env.QDRANT_API_KEY,
});
const qdrantHost = process.env.QDRANT_HOST;
const collectionName = "payout_collection";

console.log(qdrantHost);

const glob = new Glob("*.txt");

function chunker(
  text: string,
  wordsPerChunk: number,
  overlapWords: number
): string[] {
  const words = text.match(/[\w']+(?:[.,!?])?|\S/g) || [];
  console.log("words", words.length);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
    let endIndex = i + wordsPerChunk;
    const chunk = words.slice(i, endIndex).join(" ");
    chunks.push(chunk);

    if (endIndex >= words.length) break;
  }

  return chunks;
}

const chunkLength = 50;
const chunkOverlap = 20;
async function processFile(file: string) {
  console.log(`Text File: ${file}`);
  const text = await Bun.file(`${file}`).text();
  console.log("textlength", text.length);
  const chunks = chunker(text, chunkLength, chunkOverlap);
  const allChunks = [];

  for (const chunk of chunks) {
    const embed = await generateEmbedding(chunk);
    const chunkData = buildChunkData(file, chunk, embed);
    allChunks.push(chunkData);
    await saveToQdrant(chunkData);
  }

  return allChunks;
}

async function generateEmbedding(chunk: string) {
  const embeddingResult = await ollama.embeddings({
    model: "llama2",
    prompt: chunk,
  });
  return embeddingResult.embedding;
}

function buildChunkData(file: string, chunk: string, embed: number[]) {
  return {
    id: uuidv4(),
    vector: embed,
    payload: { text: chunk, file: file },
  };
}

async function saveToQdrant(data) {
  console.log("Saving to Qdrant:", data.payload.text);
  const payload = {
    points: [{ id: data.id, payload: data.payload, vector: data.vector }],
  };
  await client.upsert(collectionName, payload);
  console.log(`Saved to Qdrant successfully.`);
}

async function main() {
  console.time("Execution Time");
  const allChunks = [];
  for await (const file of new Glob("src/scripts/*.txt").scan()) {
    const fileChunks = await processFile(file);
    allChunks.push(...fileChunks);
  }

  await Bun.write(
    `embedding-l${chunkLength}-o${chunkOverlap}.json`,
    JSON.stringify(allChunks, null, 2)
  );
  console.timeEnd("Execution Time");
}

await main();
