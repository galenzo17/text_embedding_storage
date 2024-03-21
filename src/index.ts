import { Glob } from "bun";
import ollama from "ollama";
import axios from "axios";
import { QdrantClient } from "@qdrant/js-client-rest";

const chunklengths = [5, 10, 25, 50, 100, 250, 500, 1000, 5000];
const chunkoverlaps = [0, 3, 5, 10, 25, 50, 100, 500];

function chunker(
  text: string,
  wordsPerChunk: number,
  overlapWords: number
): string[] {
  const words = text.match(/[\w']+(?:[.,!?])?|\S/g) || [];

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
    let endIndex = i + wordsPerChunk;
    const chunk = words.slice(i, endIndex).join(" ");
    chunks.push(chunk);

    if (endIndex >= words.length) break;
  }

  return chunks;
}

const qdrantHost = process.env.QDRANT_HOST;
const collectionName = "my_collection";
const qdrantApiKey = process.env.QDRANT_API_KEY;
console.log(qdrantHost);

const glob = new Glob("*.txt");

for (const length of chunklengths) {
  console.log(`Chunk Length: ${length}`);
  for (const overlap of chunkoverlaps) {
    console.log(`Chunk Overlap: ${overlap}`);
    if (overlap < length) {
      const allChunks = [];

      for await (const file of glob.scan("src/scripts")) {
        console.log(`Text File: ${file}`);
        const scriptText = await Bun.file(`scripts/${file}`).toString();
        const chunks = chunker(scriptText, length, overlap);
        for await (const chunk of chunks) {
          const embed = (await ollama.embeddings({
            model: "nomic-embed-text",
            prompt: chunk,
          })).embedding;
          // const embed = ""
          const chunkjson = { text: chunk, embed: embed, file: file };
          allChunks.push(chunkjson);
          const data = {
            points: [
              {
                id: `point_${Date.now()}`, // Ejemplo de generación de un ID simple basado en el tiempo
                vector: embed,
                payload: {
                  text: chunk,
                  file: file,
                },
              },
            ],
          };
          try {
            await saveToQdrant(data);
          } catch (error) {
            console.log(error);
          }
        }
      }
      await Bun.write(
        `embedding-l${length}-o${overlap}.json`,
        JSON.stringify(allChunks, null, 2)
      );
    }
  }
}

type QdrantPointPayload = {
  text: string;
  file: string;
  // Puedes añadir más campos según sea necesario,
  // basado en tu esquema de colección en Qdrant
};

type QdrantPoint = {
  id: string; // o number, dependiendo de cómo gestionas los IDs
  vector: number[];
  payload?: QdrantPointPayload;
};

type QdrantInsertData = {
  points: QdrantPoint[];
};

const client = new QdrantClient({
  url: process.env.QDRANT_HOST || "http://127.0.0.1:6333",
  // Asegúrate de incluir tu API key si tu instancia de Qdrant la requiere
  apiKey: process.env.QDRANT_API_KEY,
});

async function saveToQdrant(data: QdrantInsertData) {
  console.log(process.env.QDRANT_HOST);
  try {
    // Asumiendo que `data.points` contiene tus puntos a insertar
    for (const point of data.points) {
      await client.upsert(collectionName, {
        points: [point],
      });
    }
    console.log(`Saved to Qdrant successfully.`);
  } catch (error) {
    console.error(`Error saving to Qdrant: ${error}`);
  }
}
