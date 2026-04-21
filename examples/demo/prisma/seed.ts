import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  await prisma.board.deleteMany();

  const board = await prisma.board.create({
    data: {
      name: "Typograph Roadmap",
    },
  });

  const columns = [
    {
      title: "Backlog",
      position: 1000,
      cards: [
        { title: "Support custom scalars", position: 1000 },
        { title: "Query complexity analysis", position: 2000 },
        { title: "Persisted operations", position: 3000 },
      ],
    },
    {
      title: "In Progress",
      position: 2000,
      cards: [
        {
          title: "Optimise SelectionSet inference",
          description:
            "Profile the slow-path in `SelectionSet<T>` — deep unions seem to dominate.",
          position: 1000,
        },
        { title: "Docs: field arguments", position: 2000 },
      ],
    },
    {
      title: "Done",
      position: 3000,
      cards: [
        { title: "Subscriptions end-to-end", position: 1000 },
        { title: "URQL integration", position: 2000 },
        { title: "Release 1.0", position: 3000 },
      ],
    },
  ];

  for (const { title, position, cards } of columns) {
    await prisma.list.create({
      data: {
        boardId: board.id,
        title,
        position,
        cards: { create: cards },
      },
    });
  }

  console.log(`Seeded board ${board.id} (${board.name})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
