// GitHub data for the card: the one part of ascii-banner that uses the
// network. One GraphQL query plus the avatar download become a snapshot that
// the offline `card` build reads, so the card itself always builds the same.
import { ConfigError } from "../config.mjs";

const GRAPHQL = "https://api.github.com/graphql";
const TIMEOUT_MS = 20_000;
const AVATAR_PX = 460; // requested avatar size; the portrait is resampled from it
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const SNAPSHOT_VERSION = 2; // 2: GitHub's day levels in, fields the card never drew out
// GitHub's shade of a contribution day, as the calendar level 0–4 it draws.
const DAY_LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

// Public, non-fork repos only: a card is public, so private repos' names,
// stars and languages never enter the snapshot. The 100 most-starred count.
// Only what the card draws is asked for, since a snapshot may get committed.
const PERSON_QUERY = `query($login: String!) {
  user(login: $login) {
    login name createdAt avatarUrl(size: ${AVATAR_PX})
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100,
                 orderBy: { field: STARGAZERS, direction: DESC }) {
      totalCount
      nodes { stargazerCount languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } } }
    }
    contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { contributionCount contributionLevel date } } } }
  }
}`;

const PROJECT_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner description stargazerCount forkCount isPrivate
    owner { login avatarUrl(size: ${AVATAR_PX}) }
    licenseInfo { spdxId }
    issues(states: OPEN) { totalCount }
    languages(first: 6, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
    releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { tagName publishedAt } }
    defaultBranchRef { name target { ... on Commit { history { totalCount } committedDate } } }
  }
}`;

async function request(url, init, what) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const why = e.name === "TimeoutError" ? `no answer in ${TIMEOUT_MS / 1000} s` : (e.cause?.code ?? e.message);
    throw new ConfigError(`fetch: ${what} failed: ${why}`);
  }
  if (res.status === 401) throw new ConfigError(`fetch: GitHub rejected the token (401); check GITHUB_TOKEN`);
  if (!res.ok) throw new ConfigError(`fetch: ${what} answered HTTP ${res.status}`);
  return res;
}

async function graphql(query, variables, token) {
  const res = await request(GRAPHQL, {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "ascii-banner" },
    body: JSON.stringify({ query, variables }),
  }, "the GitHub GraphQL API");
  const body = await res.json();
  if (body.errors?.length) throw new ConfigError(`fetch: GitHub says: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data;
}

async function avatar(url) {
  const res = await request(url, { headers: { "user-agent": "ascii-banner" } }, "the avatar download");
  const type = res.headers.get("content-type")?.split(";")[0];
  if (type !== "image/png" && type !== "image/jpeg") throw new ConfigError(`fetch: the avatar is ${type}, not PNG or JPEG`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > AVATAR_MAX_BYTES) throw new ConfigError(`fetch: the avatar is ${bytes.length} bytes, over ${AVATAR_MAX_BYTES}`);
  return { type, base64: bytes.toString("base64") };
}

/** Bytes per language summed over `nodes`, largest first. */
const languageTotals = (lists) => {
  const by = new Map();
  for (const edges of lists) for (const e of edges) by.set(e.node.name, (by.get(e.node.name) ?? 0) + e.size);
  return [...by].sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, bytes }));
};

const dayLevel = (d) => {
  const level = DAY_LEVELS[d.contributionLevel];
  if (level === undefined) throw new ConfigError(`fetch: GitHub sent an unknown contribution level "${d.contributionLevel}"`);
  return level;
};

async function person(login, token, withAvatar) {
  const u = (await graphql(PERSON_QUERY, { login }, token)).user;
  if (!u) throw new ConfigError(`fetch: no GitHub user "${login}"`);
  const cal = u.contributionsCollection.contributionCalendar;
  return {
    person: {
      login: u.login,
      name: u.name || null,
      createdAt: u.createdAt,
      followers: u.followers.totalCount,
      repos: u.repositories.totalCount,
      stars: u.repositories.nodes.reduce((a, n) => a + n.stargazerCount, 0),
      languages: languageTotals(u.repositories.nodes.map((n) => n.languages.edges)),
      contributions: {
        total: cal.totalContributions,
        weeks: cal.weeks.map((w) => ({
          start: w.contributionDays[0].date,
          days: w.contributionDays.map((d) => d.contributionCount),
          levels: w.contributionDays.map(dayLevel),
        })),
      },
    },
    avatar: withAvatar ? await avatar(u.avatarUrl) : null,
  };
}

async function project(fullName, token, withAvatar) {
  const [owner, name] = fullName.split("/");
  const r = (await graphql(PROJECT_QUERY, { owner, name }, token)).repository;
  if (!r) throw new ConfigError(`fetch: no GitHub repository "${fullName}"`);
  if (r.isPrivate) throw new ConfigError(`fetch: ${fullName} is private; a card is public, so only public repositories are fetched`);
  const head = r.defaultBranchRef?.target;
  const rel = r.releases.nodes[0];
  return {
    project: {
      name: r.nameWithOwner,
      description: r.description || null,
      stars: r.stargazerCount,
      forks: r.forkCount,
      issues: r.issues.totalCount,
      license: r.licenseInfo?.spdxId ?? null,
      languages: languageTotals([r.languages.edges]),
      release: rel ? { tag: rel.tagName, date: rel.publishedAt } : null,
      branch: r.defaultBranchRef?.name ?? null,
      commits: head?.history.totalCount ?? 0,
      lastCommit: head?.committedDate ?? null,
    },
    avatar: withAvatar ? await avatar(r.owner.avatarUrl) : null,
  };
}

/** The snapshot for a resolved `card` config; `token` is a GitHub token (GraphQL needs one). */
export async function fetchSnapshot(card, token, now = new Date()) {
  if (!token)
    throw new ConfigError(
      "fetch needs a GitHub token in GITHUB_TOKEN (or GH_TOKEN): in a workflow, `env: GITHUB_TOKEN: ${{ github.token }}`; " +
      "locally, `GITHUB_TOKEN=$(gh auth token)` or any token with no scopes",
    );
  const withAvatar = card.portrait === "avatar";
  let data;
  if (card.mode === "person") {
    if (!card.user) throw new ConfigError('card.user: mode "person" needs a GitHub login to fetch');
    data = await person(card.user, token, withAvatar);
  } else {
    if (!card.repo) throw new ConfigError('card.repo: mode "project" needs "owner/name" to fetch');
    data = await project(card.repo, token, withAvatar);
  }
  return { version: SNAPSHOT_VERSION, mode: card.mode, fetchedAt: now.toISOString(), ...data };
}
