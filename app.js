const app = document.getElementById("app");
const searchInput = document.getElementById("searchInput");
const themeToggle = document.getElementById("themeToggle");

let allTopics = [];
const THEME_KEY = "dsa-sheet-theme";

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light Mode" : "Dark Mode";
}

function setupTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = saved || (prefersDark ? "dark" : "light");
  applyTheme(initial);
}

function difficultyClass(diff) {
  return diff.toLowerCase();
}

function matchesQuery(topic, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (topic.name.toLowerCase().includes(q)) return true;
  return topic.subtopics.some((sub) => {
    if (sub.name.toLowerCase().includes(q)) return true;
    return sub.questions.some((ques) => ques.name.toLowerCase().includes(q));
  });
}

function render(topics) {
  if (!topics.length) {
    app.innerHTML = '<p class="muted">No matching topic/question found.</p>';
    return;
  }

  app.innerHTML = topics
    .map(
      (topic) => `
      <details class="topic" open>
        <summary>${topic.name} <span class="muted">(${topic.subtopics.length} subtopics)</span></summary>
        ${topic.subtopics
          .map(
            (sub) => `
            <details class="subtopic">
              <summary>${sub.name} <span class="muted">(${sub.questions.length} questions)</span></summary>
              <ol class="question-list">
                ${sub.questions
                  .map(
                    (q) => `
                    <li class="question-item">
                      <a href="${q.link}" target="_blank" rel="noopener noreferrer">${q.name}</a>
                      <span class="badge ${difficultyClass(q.difficulty)}">${q.difficulty}</span>
                    </li>
                  `
                  )
                  .join("")}
              </ol>
            </details>
          `
          )
          .join("")}
      </details>
    `
    )
    .join("");
}

async function init() {
  const res = await fetch("./sheet-data.json");
  const data = await res.json();
  allTopics = data.topics;
  render(allTopics);
}

searchInput.addEventListener("input", (event) => {
  const query = event.target.value.trim();
  const filtered = allTopics
    .filter((t) => matchesQuery(t, query))
    .map((topic) => ({
      ...topic,
      subtopics: topic.subtopics
        .map((sub) => ({
          ...sub,
          questions: sub.questions.filter(
            (q) =>
              !query ||
              q.name.toLowerCase().includes(query.toLowerCase()) ||
              sub.name.toLowerCase().includes(query.toLowerCase()) ||
              topic.name.toLowerCase().includes(query.toLowerCase())
          ),
        }))
        .filter((sub) => sub.questions.length),
    }));

  render(filtered);
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
});

setupTheme();

init().catch(() => {
  app.innerHTML = '<p class="muted">Failed to load sheet data.</p>';
});
