const endpoint =
  process.env.GRAPHQL_URL ?? "http://localhost:3456/api/graphql";

const boardId =
  process.env.NEXT_PUBLIC_BOARD_ID ??
  (() => {
    throw new Error("NEXT_PUBLIC_BOARD_ID must be set in .env");
  })();

const gql = async (
  query: string,
  variables: Record<string, unknown> = {},
): Promise<unknown> => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: unknown;
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
};

const clientId = "c_smoke";

async function main() {
  const initial = (await gql(
    `query($id: String!) { board(id: $id) { id lists { id title cards { id title } } } }`,
    { id: boardId },
  )) as { board: { lists: { id: string; title: string }[] } };

  console.log(
    `✓ query   — board has ${initial.board.lists.length} list(s)`,
  );

  const created = (await gql(
    `mutation($b: String!, $t: String!, $c: String!) {
      createList(boardId: $b, title: $t, clientId: $c) { id title position }
    }`,
    { b: boardId, t: "Smoke", c: clientId },
  )) as { createList: { id: string; title: string; position: number } };
  console.log(`✓ createList — ${created.createList.id}`);

  const renamed = (await gql(
    `mutation($i: String!, $t: String!, $c: String!) {
      renameList(id: $i, title: $t, clientId: $c) { id title }
    }`,
    { i: created.createList.id, t: "Smoke renamed", c: clientId },
  )) as { renameList: { title: string } };
  console.log(`✓ renameList — ${renamed.renameList.title}`);

  const card = (await gql(
    `mutation($l: String!, $t: String!, $c: String!) {
      createCard(listId: $l, title: $t, clientId: $c) { id title position }
    }`,
    { l: created.createList.id, t: "smoke card", c: clientId },
  )) as { createCard: { id: string; position: number } };
  console.log(`✓ createCard — ${card.createCard.id}`);

  await gql(
    `mutation($i: String!, $t: String!, $d: String!, $c: String!) {
      updateCard(id: $i, title: $t, description: $d, clientId: $c) { id description }
    }`,
    {
      i: card.createCard.id,
      t: "smoke card v2",
      d: "updated body",
      c: clientId,
    },
  );
  console.log(`✓ updateCard`);

  await gql(
    `mutation($i: String!, $l: String!, $p: Float!, $c: String!) {
      moveCard(id: $i, toListId: $l, position: $p, clientId: $c) { id position listId }
    }`,
    {
      i: card.createCard.id,
      l: created.createList.id,
      p: 42,
      c: clientId,
    },
  );
  console.log(`✓ moveCard`);

  await gql(
    `mutation($i: String!, $c: String!) { deleteCard(id: $i, clientId: $c) }`,
    { i: card.createCard.id, c: clientId },
  );
  console.log(`✓ deleteCard`);

  await gql(
    `mutation($i: String!, $c: String!) { deleteList(id: $i, clientId: $c) }`,
    { i: created.createList.id, c: clientId },
  );
  console.log(`✓ deleteList`);

  console.log("\nAll mutations succeeded ✨");
}

main().catch((err) => {
  console.error("smoke test failed:", err);
  process.exit(1);
});
