import assert from "node:assert/strict";
import test from "node:test";
import { scoreJob, rankJobs } from "../server/matching.js";
import { primaryJobs } from "../server/seed-data.js";
import { getCandidateById } from "../server/candidates.js";

function scoreSkills(requiredSkills, candidateSkills, workMode = "Hybrid") {
  return scoreJob(
    { skills: requiredSkills, location: "Bern", workMode },
    { skills: candidateSkills, location: "Zurich" },
  );
}

test("exact skill matches preserve full credit and normalization", () => {
  const result = scoreSkills([" React ", "TypeScript"], ["react", " TYPESCRIPT "]);
  assert.equal(result.score, 80);
  assert.equal(result.matchedCount, 2);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matchType), ["exact", "exact"]);
  assert.deepEqual(result.skillBreakdown.map((item) => item.contribution), [1, 1]);
  assert.ok(result.skillBreakdown.every((item) => item.reason === "Exact skill"));
});

test("Maya receives related credit without changing the exact match count", () => {
  const result = scoreJob(primaryJobs[0], getCandidateById("candidate-001"));
  assert.equal(result.score, 90);
  assert.equal(result.matchedCount, 3);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matched), [true, true, true, false]);
  assert.equal(result.locationFits, true);
  assert.equal(result.skillBreakdown[3].matchType, "related");
  assert.equal(result.skillBreakdown[3].candidateSkill, "React");
  assert.equal(result.skillBreakdown[3].contribution, 0.5);
});

test("an explicit specific-to-broader link receives half credit and an explanation", () => {
  const result = scoreSkills([" FRONTEND development "], [" react "]);
  assert.equal(result.score, 40);
  assert.equal(result.matchedCount, 0);
  assert.deepEqual(result.skillBreakdown[0], {
    skill: " FRONTEND development ",
    matched: false,
    matchType: "related",
    contribution: 0.5,
    candidateSkill: "React",
    reason: "Related skill: React (50% credit)",
  });
});

test("unrelated, unknown, reverse, and sibling skills remain missing", () => {
  for (const [required, candidate] of [
    ["Frontend development", "Figma"],
    ["Unknown skill", "React"],
    ["React", "Frontend development"],
    ["TypeScript", "Python"],
  ]) {
    const result = scoreSkills([required], [candidate]);
    assert.equal(result.score, 0);
    assert.deepEqual(result.skillBreakdown[0], {
      skill: required, matched: false, matchType: "missing", contribution: 0,
      candidateSkill: null, reason: "Not found",
    });
  }
});

test("exact evidence wins and several supporting skills never stack", () => {
  const exact = scoreSkills(["Programming languages"], ["Python", "Programming languages", "TypeScript"]);
  assert.equal(exact.score, 80);
  assert.equal(exact.matchedCount, 1);
  assert.equal(exact.skillBreakdown[0].matchType, "exact");

  const related = scoreSkills(["Programming languages"], ["TypeScript", "Python", "Python"]);
  assert.equal(related.score, 40);
  assert.deepEqual(related, scoreSkills(["Programming languages"], ["Python", "TypeScript"]));
});

test("one candidate skill may support exact and broader requirements independently", () => {
  const result = scoreSkills(["React", "Frontend development"], ["React"]);
  assert.equal(result.score, 60);
  assert.equal(result.matchedCount, 1);
  assert.deepEqual(result.skillBreakdown.map((item) => item.contribution), [1, 0.5]);
});

test("mixed skill contributions and location reconstruct the rounded score", () => {
  const result = scoreSkills(["React", "Frontend development", "Figma"], ["React"], "Remote");
  const contribution = result.skillBreakdown.reduce((sum, item) => sum + item.contribution, 0);
  assert.equal(result.score, 60);
  assert.equal(result.score, Math.round(80 * contribution / result.requiredCount + 20));
  assert.deepEqual(result.skillBreakdown.map((item) => item.matchType), ["exact", "related", "missing"]);
  assert.equal(scoreSkills(["React", "Figma", "SQL"], ["React"]).score, 27);
});

test("remote location points remain independent of exact, related, or missing skills", () => {
  for (const [skills, expectedScore] of [[["React"], 100], [["Frontend development"], 60], [["Figma"], 20]]) {
    const result = scoreSkills(skills, ["React"], "Remote");
    assert.equal(result.score, expectedScore);
    assert.equal(result.locationFits, true);
  }
});

test("empty requirements and profiles stay finite and within score bounds", () => {
  for (const requirements of [[], ["React"], ["Frontend development"]]) {
    for (const skills of [[], ["React"]]) {
      for (const workMode of ["Hybrid", "Remote"]) {
        const result = scoreSkills(requirements, skills, workMode);
        assert.ok(Number.isInteger(result.score));
        assert.ok(result.score >= 0 && result.score <= 100);
        assert.deepEqual(result, scoreSkills(requirements, skills, workMode));
      }
    }
  }
  assert.equal(scoreSkills([], ["React"]).score, 0);
  assert.equal(scoreSkills([], ["React"], "Remote").score, 20);
});

test("remote roles count as a location fit and ranking is stable", () => {
  const candidate = getCandidateById("candidate-003");
  const ranked = rankJobs(primaryJobs, candidate);
  assert.equal(ranked[0].id, "job-103");
  assert.equal(ranked[0].match.locationFits, true);
});

test("equal scores retain the title tie-breaker and stable order for identical titles", () => {
  const jobs = [
    { id: "z", title: "Zulu", skills: ["Frontend development"], location: "Bern", workMode: "Hybrid" },
    { id: "a1", title: "Alpha", skills: ["Frontend development"], location: "Bern", workMode: "Hybrid" },
    { id: "a2", title: "Alpha", skills: ["Frontend development"], location: "Bern", workMode: "Hybrid" },
  ];
  const candidate = { skills: ["React"], location: "Zurich" };
  assert.deepEqual(rankJobs(jobs, candidate).map((job) => job.id), ["a1", "a2", "z"]);
  assert.deepEqual(rankJobs(jobs, candidate), rankJobs(jobs, candidate));
});
