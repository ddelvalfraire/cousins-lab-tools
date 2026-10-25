import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    try {
      setGreetMsg(await invoke<string>("greet", { name }));
    } catch {
      setGreetMsg("The Rust command is unavailable. Use bun run tauri dev to check the native connection.");
    }
  }

  return (
    <main className="container">
      <h1>DV-Dash</h1>
      <p>Desktop starter. Instrument workflows have not been migrated yet.</p>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Enter a name to check the connection between React and Rust.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          aria-label="Name"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Check native connection</button>
      </form>
      <p role="status">{greetMsg}</p>
    </main>
  );
}

export default App;
