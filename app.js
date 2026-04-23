const app = document.getElementById("app");
const searchInput = document.getElementById("searchInput");
const themeToggle = document.getElementById("themeToggle");
const DATA_VERSION = "20260423-3";

let allTopics = [];
const THEME_KEY = "dsa-sheet-theme";
const STATUS_KEY = "dsa-sheet-status-map";
let statusMap = {};

function questionTitle(question) {
  return question.title || question.name || "Untitled Question";
}

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

function safeKey(value) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

function questionId(topicName, subtopicName, questionName) {
  return `${safeKey(topicName)}::${safeKey(subtopicName)}::${safeKey(questionName)}`;
}

function directQuestionLink(rawLink) {
  if (!rawLink) {
    return "";
  }

  try {
    const url = new URL(rawLink);
    if (url.hostname === "leetcode.com" && url.pathname.endsWith("/description/")) {
      return `${url.origin}${url.pathname.replace(/\/description\/$/, "/")}${url.search}${url.hash}`;
    }

    if (url.hostname === "leetcode.com" && url.pathname.endsWith("/description")) {
      return `${url.origin}${url.pathname.replace(/\/description$/, "/")}${url.search}${url.hash}`;
    }
  } catch {
    return rawLink;
  }

  return rawLink;
}

function loadStatusMap() {
  try {
    statusMap = JSON.parse(localStorage.getItem(STATUS_KEY) || "{}");
  } catch {
    statusMap = {};
  }
}

function saveStatusMap() {
  localStorage.setItem(STATUS_KEY, JSON.stringify(statusMap));
}

function matchesQuery(topic, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (topic.name.toLowerCase().includes(q)) return true;
  return topic.subtopics.some((sub) => {
    if (sub.name.toLowerCase().includes(q)) return true;
    return sub.questions.some((ques) => questionTitle(ques).toLowerCase().includes(q));
  });
}

function getCheckedCount(topicName, subName, questions) {
  return questions.reduce((count, q) => {
    const id = questionId(topicName, subName, questionTitle(q));
    return count + (statusMap[id] ? 1 : 0);
  }, 0);
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
              <summary>
                <span>${sub.name}</span>
                <span class="summary-right">
                  <span class="progress-pill">${getCheckedCount(topic.name, sub.name, sub.questions)}/${sub.questions.length}</span>
                </span>
              </summary>
              <div class="table-head">
                <span>#</span>
                <span>Problem Name</span>
                <span>Difficulty</span>
                <span>Status</span>
              </div>
              <ol class="question-list">
                ${sub.questions
                  .map(
                    (q, index) => {
                      const title = questionTitle(q);
                      const link = directQuestionLink(q.link);
                      const questionLabel = `${title} <span class="question-link-icon" aria-hidden="true">🔗</span>`;
                      return `
                    <li class="question-item">
                      <span class="q-index">${index + 1}</span>
                      ${
                        link
                          ? `<a class="question-link" href="${link}" target="_blank" rel="noopener noreferrer">${questionLabel}</a>`
                          : `<span class="question-link question-link-disabled">${title} <span class="question-link-unavailable">Link not available</span></span>`
                      }
                      <span class="badge ${difficultyClass(q.difficulty)}">${q.difficulty}</span>
                      <label class="status-box" title="Mark completed">
                        <input
                          type="checkbox"
                          class="status-checkbox"
                          data-id="${questionId(topic.name, sub.name, title)}"
                          ${statusMap[questionId(topic.name, sub.name, title)] ? "checked" : ""}
                        />
                        <span>Done</span>
                      </label>
                    </li>
                  `;
                    }
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
  const res = await fetch(`./sheet-data.json?v=${DATA_VERSION}`, { cache: "no-store" });
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
              questionTitle(q).toLowerCase().includes(query.toLowerCase()) ||
              sub.name.toLowerCase().includes(query.toLowerCase()) ||
              topic.name.toLowerCase().includes(query.toLowerCase())
          ),
        }))
        .filter((sub) => sub.questions.length),
    }));

  render(filtered);
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.classList.contains("status-checkbox")) return;

  const id = target.dataset.id;
  if (!id) return;

  statusMap[id] = target.checked;
  saveStatusMap();
  const query = searchInput.value.trim();
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
              questionTitle(q).toLowerCase().includes(query.toLowerCase()) ||
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
loadStatusMap();

init().catch(() => {
  app.innerHTML = '<p class="muted">Failed to load sheet data.</p>';
});
