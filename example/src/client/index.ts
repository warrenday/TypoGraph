import { createClient } from "../../../src";
import { type TypeDefs } from "../../server/entitiies/index";

const client = createClient<TypeDefs>();

const run = async () => {
  const user = await client.query("getUser", {
    id: true,
    name: true,
    articles: {
      id: true,
      title: true,
    },
  });

  const title = user.articles[0].id;

  // user.articles

  // // user.name;
  // user.articles.map((article) => article.author.name);
};

run();
