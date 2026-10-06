import { FormEvent, useState } from "react";

const assetPathPrefix = "/assets";
const typewriterImage = `${assetPathPrefix}/048d3.png`;

export default function App() {
  const [query, setQuery] = useState("places to get lost");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main className="typewriter-viewport">
      <div className="typewriter-stage">
        <img
          alt="A vintage typewriter on a wooden writing desk"
          className="typewriter-photo"
          src={typewriterImage}
        />

        <form className="paper-search" onSubmit={handleSubmit} role="search">
          <header className="paper-search__letterhead">
            <p>THE SEARCH ROOM</p>
            <p className="paper-search__number">No. 001</p>
          </header>

          <div className="paper-search__rule" />

          <div className="paper-search__entry">
            <label className="paper-search__prompt" htmlFor="search-query">
              What are you looking for?
            </label>
            <input
              autoComplete="off"
              autoFocus
              className="paper-search__input"
              id="search-query"
              name="query"
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
              type="search"
              value={query}
            />
            <p className="paper-search__hint">Press return to search.</p>
          </div>
        </form>
      </div>
    </main>
  );
}
