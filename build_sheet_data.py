import json
import re
from pathlib import Path

from pypdf import PdfReader


PDF_PATH = Path(r"C:/Users/abhiu/Downloads/DSA_FORMWISE SHEET.pdf")
OUT_PATH = Path("sheet-data.json")

DIFFICULTIES = {"Easy", "Medium", "Hard", "Extreme"}
SKIP_LEFT_COLUMN = {"Ask Video", "Solution", "Requested", "Bookmark", "Status", "#"}
QUESTION_LINK_X_MIN = 250
QUESTION_LINK_X_MAX = 360


def extract_layout_lines(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    lines: list[str] = []
    for page in reader.pages:
        text = page.extract_text(extraction_mode="layout") or ""
        for raw in text.splitlines():
            if not raw.strip():
                continue
            lines.append(raw.rstrip("\n"))
    return lines


def extract_question_links(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    links: list[str] = []

    for page in reader.pages:
        annots = page.get("/Annots")
        if not annots:
            continue

        previous_uri = None
        for annot_ref in annots.get_object():
            annot = annot_ref.get_object()
            action = annot.get("/A")
            uri = action.get("/URI") if action else None
            rect = annot.get("/Rect")
            x1 = float(rect[0]) if rect else None
            if (
                uri
                and x1 is not None
                and QUESTION_LINK_X_MIN <= x1 <= QUESTION_LINK_X_MAX
                and is_problem_link(str(uri))
                and uri != previous_uri
            ):
                links.append(normalize_link(str(uri)))
            previous_uri = uri

    return links


def normalize_link(link: str) -> str:
    normalized = link.strip()
    normalized = re.sub(
        r"^(https://leetcode\.com/problems/[^/]+/)description/?$",
        r"\1",
        normalized,
    )
    return normalized


def is_problem_link(link: str) -> bool:
    lowered = link.lower()
    blocked_terms = ("youtube", "youtu.be", "video", "solution", "playlist")
    return lowered.startswith("http") and not any(term in lowered for term in blocked_terms)


def first_column_text(line: str) -> str:
    text = line.strip()
    if not text:
        return ""
    parts = re.split(r"\s{2,}", text)
    return parts[0].strip()


def parse_numbered_row(line: str) -> tuple[str, str]:
    m = re.match(r"^\s*\d+\s+(.*)$", line)
    if not m:
        return "", "Medium"
    payload = m.group(1).strip()
    cols = [c.strip() for c in re.split(r"\s{2,}", payload) if c.strip()]
    if not cols:
        return "", "Medium"
    name_tail = cols[0]
    difficulty = next((c for c in cols[1:] if c in DIFFICULTIES), "Medium")
    return name_tail, difficulty


def parse_structure(lines: list[str], question_links: list[str] | None = None) -> list[dict]:
    topics: list[dict] = []
    topic_index: dict[str, dict] = {}
    heading_buffer: list[str] = []
    link_index = 0
    i = 0

    while i < len(lines):
        raw = lines[i]
        line = raw.strip()

        if re.fullmatch(r"\d+/\d+", line):
            subtopic = heading_buffer[-1] if heading_buffer else "Subtopic"
            topic = heading_buffer[-2] if len(heading_buffer) >= 2 else "General"
            if topic not in topic_index:
                topic_index[topic] = {"name": topic, "subtopics": []}
                topics.append(topic_index[topic])
            current_subtopic = {"name": subtopic, "questions": []}
            topic_index[topic]["subtopics"].append(current_subtopic)

            i += 1
            while i < len(lines) and "Problem Name" not in lines[i]:
                i += 1
            i += 1

            name_buffer: list[str] = []
            while i < len(lines):
                current = lines[i]
                stripped = current.strip()

                if re.fullmatch(r"\d+/\d+", stripped):
                    break
                if (
                    stripped
                    and not current.startswith(" ")
                    and not re.match(r"^\d+\s+\S+", stripped)
                    and i + 1 < len(lines)
                    and re.fullmatch(r"\d+/\d+", lines[i + 1].strip())
                ):
                    break
                if (
                    stripped
                    and not current.startswith(" ")
                    and not re.match(r"^\d+\s+\S+", stripped)
                    and i + 2 < len(lines)
                    and re.fullmatch(r"\d+/\d+", lines[i + 2].strip())
                ):
                    break

                if re.match(r"^\s*\d+\s+", current):
                    name_tail, difficulty = parse_numbered_row(current)
                    parts = name_buffer[:]
                    if name_tail:
                        parts.append(name_tail)
                    name = re.sub(r"\s+", " ", " ".join(parts)).strip()
                    if name:
                        if question_links is None or link_index >= len(question_links):
                            raise ValueError(f"Missing PDF link for question: {name}")
                        link = question_links[link_index]
                        link_index += 1
                        current_subtopic["questions"].append(
                            {
                                "title": name,
                                "link": normalize_link(link),
                                "difficulty": difficulty,
                            }
                        )
                    name_buffer = []
                    i += 1
                    continue

                if re.match(r"^\s*--\s+\d+\s+of\s+\d+\s+--\s*$", current):
                    i += 1
                    continue

                first = first_column_text(current)
                if first and first not in SKIP_LEFT_COLUMN and first not in DIFFICULTIES:
                    name_buffer.append(first)
                i += 1

            heading_buffer = [topic]
            continue

        if not raw.startswith(" ") and "Problem Name" not in line and not re.fullmatch(r"-- \d+ of \d+ --", line):
            heading_buffer.append(line)
            if len(heading_buffer) > 3:
                heading_buffer = heading_buffer[-3:]
        i += 1

    clean_topics: list[dict] = []
    for topic in topics:
        subtopics = [s for s in topic["subtopics"] if s["questions"]]
        if subtopics:
            clean_topics.append({"name": topic["name"], "subtopics": subtopics})
    fixed_topics: list[dict] = []
    for topic in clean_topics:
        is_malformed = bool(re.search(r"\d{2,}\s{2,}", topic["name"])) or "Solution" in topic["name"]
        if is_malformed and fixed_topics:
            fixed_topics[-1]["subtopics"].extend(topic["subtopics"])
        else:
            fixed_topics.append(topic)
    return fixed_topics


def main() -> None:
    if not PDF_PATH.exists():
        raise FileNotFoundError(f"PDF not found: {PDF_PATH}")
    lines = extract_layout_lines(PDF_PATH)
    question_links = extract_question_links(PDF_PATH)
    topics = parse_structure(lines, question_links)
    OUT_PATH.write_text(json.dumps({"topics": topics}, indent=2), encoding="utf-8")
    question_count = sum(len(s["questions"]) for t in topics for s in t["subtopics"])
    if len(question_links) != question_count:
        raise ValueError(
            f"PDF link count mismatch: extracted {len(question_links)} links for {question_count} questions"
        )
    print(f"Created {OUT_PATH} with {len(topics)} topics and {question_count} questions")


if __name__ == "__main__":
    main()
