import { broaderSkills } from "./skills.js";

function normalized(value) {
  return value.trim().toLowerCase();
}

export function scoreJob(job, candidate) {
  const candidateSkills = new Set(candidate.skills.map(normalized));
  const skillBreakdown = job.skills.map((skill) => {
    if (candidateSkills.has(normalized(skill))) {
      return { skill, matched: true, matchType: "exact", contribution: 1, candidateSkill: skill, reason: "Exact skill" };
    }

    // Only explicit specific-to-broader links count. Pick one stable explanation,
    // even when several candidate skills support the same requirement.
    const relatedSkill = Object.keys(broaderSkills).sort().find((specificSkill) => (
      candidateSkills.has(normalized(specificSkill))
      && broaderSkills[specificSkill].some((broaderSkill) => normalized(broaderSkill) === normalized(skill))
    ));
    if (relatedSkill) {
      return {
        skill,
        matched: false, // This flag and matchedCount remain exact-only for existing consumers.
        matchType: "related",
        contribution: 0.5,
        candidateSkill: relatedSkill,
        reason: `Related skill: ${relatedSkill} (50% credit)`,
      };
    }

    return { skill, matched: false, matchType: "missing", contribution: 0, candidateSkill: null, reason: "Not found" };
  });
  const matchedCount = skillBreakdown.filter((item) => item.matched).length;
  const contribution = skillBreakdown.reduce((total, item) => total + item.contribution, 0);
  const skillScore = job.skills.length ? contribution / job.skills.length : 0;
  const locationFits = job.location === candidate.location || job.workMode === "Remote";
  const score = Math.round(skillScore * 80 + (locationFits ? 20 : 0));

  return {
    score,
    matchedCount,
    requiredCount: job.skills.length,
    locationFits,
    skillBreakdown,
  };
}

export function rankJobs(jobs, candidate) {
  return jobs
    .map((job) => ({ ...job, match: scoreJob(job, candidate) }))
    .sort((a, b) => b.match.score - a.match.score || a.title.localeCompare(b.title));
}
