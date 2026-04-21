import { useState } from "react";
import { useQuery, useMutation } from "./main";

export function App() {
  const [result, reexecute] = useQuery({
    message: { id: true, text: true },
  });
  const [, setMessage] = useMutation({
    setMessage: { id: true, text: true },
  });
  const [draft, setDraft] = useState("");

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>typograph + yoga + urql</h1>
      {result.fetching && <p>loading…</p>}
      {result.error && <p style={{ color: "red" }}>{result.error.message}</p>}
      {result.data && (
        <p>
          <strong>message:</strong> {result.data.message.text}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft) return;
          await setMessage({ text: draft });
          setDraft("");
          reexecute({ requestPolicy: "network-only" });
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="new message…"
        />
        <button type="submit">set</button>
      </form>
    </main>
  );
}
