(() => {
  const papers = window.PAPER_CATALOG || [];
  const search = document.getElementById("search");
  const sort = document.getElementById("sort");
  const filters = document.getElementById("filters");
  const results = document.getElementById("results");
  const empty = document.getElementById("empty");
  let topic = "All";

  const topics = ["All", ...new Set(papers.flatMap(paper => paper.topics))];
  document.getElementById("paper-count").textContent =
    papers.length === 1 ? "1 visualization" : papers.length + " visualizations";

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function link(text, href, className, external = false) {
    const anchor = element("a", className, text);
    anchor.href = href;
    if (external) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    return anchor;
  }

  function renderFilters() {
    filters.replaceChildren();
    for (const name of topics) {
      const button = element("button", "", name);
      button.type = "button";
      button.setAttribute("aria-pressed", String(name === topic));
      button.addEventListener("click", () => {
        topic = name;
        renderFilters();
        render();
      });
      filters.append(button);
    }
  }

  function paperCard(paper) {
    const card = element("article", "paper");
    const imageLink = link("", paper.path, "paper-image");
    imageLink.setAttribute("aria-label", "Open " + paper.shortTitle + " visualization");
    const image = element("img");
    image.src = paper.preview;
    image.alt = "3D teaching reconstruction for " + paper.shortTitle;
    image.loading = "eager";
    imageLink.append(image);

    const body = element("div", "paper-body");
    body.append(element("div", "paper-meta", paper.venue + "  ·  " + paper.topics.join(" / ")));
    const heading = element("h3");
    heading.append(link(paper.title, paper.path));
    body.append(heading);
    body.append(element("p", "authors", paper.authors));
    body.append(element("p", "summary", paper.summary));
    const links = element("div", "paper-links");
    links.append(
      link("Open visualization →", paper.path, "primary-link"),
      link("Paper ↗", paper.paper, "", true),
      link("Code ↗", paper.code, "", true)
    );
    body.append(links);
    card.append(imageLink, body);
    return card;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const visible = papers.filter(paper => {
      const matchesTopic = topic === "All" || paper.topics.includes(topic);
      const haystack = [paper.title, paper.authors, paper.venue, ...paper.topics].join(" ").toLowerCase();
      return matchesTopic && haystack.includes(query);
    }).sort((a, b) => sort.value === "title"
      ? a.title.localeCompare(b.title)
      : b.added.localeCompare(a.added) || a.title.localeCompare(b.title));
    results.replaceChildren(...visible.map(paperCard));
    empty.hidden = visible.length !== 0;
  }

  search.addEventListener("input", render);
  sort.addEventListener("change", render);
  renderFilters();
  render();
})();
