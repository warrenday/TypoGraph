import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const board = await prisma.board.findFirst({
    include: {
      lists: {
        orderBy: { position: "asc" },
        include: { cards: { orderBy: { position: "asc" } } },
      },
    },
  });

  if (!board) {
    console.error("No board found — run `npm run db:seed` first.");
    process.exit(1);
  }

  console.log(`Board: ${board.name} (${board.id})`);
  for (const list of board.lists) {
    console.log(`  └─ ${list.title} (pos=${list.position}, ${list.cards.length} cards)`);
    for (const card of list.cards) {
      console.log(`       · ${card.title}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
