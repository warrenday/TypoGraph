import { EventEmitter } from "node:events";

type BoardChangeEvent = {
  type: "created" | "updated" | "moved" | "deleted";
  listId?: string;
  list?: unknown;
  originClientId?: string;
};

type CardChangeEvent = {
  type: "created" | "updated" | "moved" | "deleted";
  cardId?: string;
  fromListId?: string;
  toListId?: string;
  card?: unknown;
  originClientId?: string;
};

type Topic =
  | `board:${string}:list`
  | `board:${string}:card`;

type Payload<T extends Topic> = T extends `board:${string}:list`
  ? BoardChangeEvent
  : T extends `board:${string}:card`
  ? CardChangeEvent
  : never;

const globalForEmitter = globalThis as unknown as {
  __typographKanbanEmitter?: EventEmitter;
};

const emitter =
  globalForEmitter.__typographKanbanEmitter ??
  (() => {
    const e = new EventEmitter();
    e.setMaxListeners(100);
    return e;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForEmitter.__typographKanbanEmitter = emitter;
}

export const publish = <T extends Topic>(topic: T, event: Payload<T>): void => {
  emitter.emit(topic, event);
};

export async function* subscribe<T extends Topic>(
  topic: T
): AsyncIterable<Payload<T>> {
  const queue: Payload<T>[] = [];
  const waiters: ((value: IteratorResult<Payload<T>>) => void)[] = [];
  let done = false;

  const listener = (event: Payload<T>) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      queue.push(event);
    }
  };

  emitter.on(topic, listener);

  try {
    while (!done) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      const result = await new Promise<IteratorResult<Payload<T>>>((resolve) => {
        waiters.push(resolve);
      });
      if (result.done) return;
      yield result.value;
    }
  } finally {
    done = true;
    emitter.off(topic, listener);
  }
}
