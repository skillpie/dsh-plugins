/**
 * @skillpie/dsh-market — SkillPie (https://skillpie.cn) market client + installer (host half core).
 *
 * Public, auth-free HTTP API. The field contract mirrors ZCode's
 * packages/shared/src/skill-market.ts (verified against the live service):
 *   GET  /api/skills?query=&limit=                           → { skills: [...] }
 *   GET  /api/skills/by-normalized-name/<name>               → { skill: { ..., version } }
 *   GET  /api/skills/by-normalized-name/<name>/download-url  → { downloadUrl }
 *
 * Install target: the user-level skills root (~/.agents/skills/<normalizedName>),
 * the directory DSH scans for session skills. Install safety mirrors ZCode's
 * skillMarketInstall.ts: safe single-segment target name, per-entry path checks,
 * package/extracted size caps, entry count cap, and a skill directory that must
 * contain exactly one SKILL.md.
 */
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fromBuffer } from 'yauzl'

export const DEFAULT_BASE_URL = 'https://skillpie.cn'
export const DEFAULT_SKILL_ROOT = join(homedir(), '.agents', 'skills')

const API_TIMEOUT_MS = 10_000
const DOWNLOAD_TIMEOUT_MS = 60_000
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 20 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 4096
const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 20
/** Target directory name: one safe path segment, no traversal possible. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export class SkillMarketError extends Error {}

/** Fetch JSON with a hard timeout; non-2xx carries the first bytes of the body. */
async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new SkillMarketError(`skill market request failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`)
  }
  return await response.json()
}

function joinMarketUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/u, '')}${path}`
}

function resolveAbsoluteMarketUrl(baseUrl, url) {
  if (/^https?:\/\//iu.test(url)) return url
  return joinMarketUrl(baseUrl, url)
}

function toFiniteNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Server fields are loosely mapped; missing fields fall back here, never throw. */
function toSearchResult(baseUrl, skill) {
  return {
    id: typeof skill.id === 'string' ? skill.id : '',
    name: typeof skill.name === 'string' ? skill.name : '',
    normalizedName: typeof skill.normalizedName === 'string' ? skill.normalizedName : '',
    category: typeof skill.category === 'string' && skill.category !== '' ? skill.category : null,
    description: typeof skill.description === 'string' ? skill.description : '',
    ownerDisplayName: typeof skill.ownerDisplayName === 'string' ? skill.ownerDisplayName : '',
    downloadCount: toFiniteNumber(skill.downloadCount),
    likeCount: toFiniteNumber(skill.likeCount),
    versionNo: toFiniteNumber(skill.version?.versionNo),
    isFree: skill.isFree !== false,
  }
}

/** Loose SKILL.md frontmatter parse for the installed-skills list. */
function parseFrontmatter(text) {
  const meta = { title: null, description: null, category: null }
  if (!text.startsWith('---')) return meta
  const end = text.indexOf('\n---', 3)
  if (end < 0) return meta
  for (const line of text.slice(4, end).split('\n')) {
    const match = /^(name|title|description|category):\s*(.+?)\s*$/u.exec(line)
    if (match) {
      const key = match[1] === 'name' ? 'title' : match[1]
      if (meta[key] == null) meta[key] = match[2].replace(/^["']|["']$/gu, '')
    }
  }
  return meta
}

export function createMarket(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const skillRoot = options.skillRoot ?? DEFAULT_SKILL_ROOT
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL

  const assertSafeNormalizedName = (normalizedName) => {
    const name = typeof normalizedName === 'string' ? normalizedName.trim() : ''
    if (!SAFE_NAME.test(name)) {
      throw new SkillMarketError(`unsafe skill market name: ${normalizedName}`)
    }
    return name
  }

  const market = {
    /** Search the public catalog. Empty query returns an empty list. */
    async search(query, limit) {
      const trimmed = typeof query === 'string' ? query.trim() : ''
      if (!trimmed) return []
      const capped = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT)
      const params = new URLSearchParams({ query: trimmed, limit: String(capped) })
      const data = await fetchJson(fetchImpl, joinMarketUrl(baseUrl, `/api/skills?${params.toString()}`))
      return (Array.isArray(data?.skills) ? data.skills : []).map((skill) => toSearchResult(baseUrl, skill))
    },

    /** Skill detail; also the source of the paid check and package URL. */
    async detail(normalizedName) {
      const name = assertSafeNormalizedName(normalizedName)
      const data = await fetchJson(
        fetchImpl,
        joinMarketUrl(baseUrl, `/api/skills/by-normalized-name/${encodeURIComponent(name)}`),
      )
      const skill = data?.skill
      if (!skill) throw new SkillMarketError(`skill not found in market: ${name}`)
      const version = skill.version && typeof skill.version === 'object' ? skill.version : null
      const packageDownloadUrl =
        typeof version?.packageDownloadUrl === 'string' && version.packageDownloadUrl !== ''
          ? resolveAbsoluteMarketUrl(baseUrl, version.packageDownloadUrl)
          : null
      return {
        id: typeof skill.id === 'string' ? skill.id : '',
        name: typeof skill.name === 'string' && skill.name !== '' ? skill.name : name,
        normalizedName: name,
        category: typeof skill.category === 'string' && skill.category !== '' ? skill.category : null,
        description: typeof skill.description === 'string' ? skill.description : '',
        ownerDisplayName: typeof skill.ownerDisplayName === 'string' ? skill.ownerDisplayName : '',
        downloadCount: toFiniteNumber(skill.downloadCount),
        likeCount: toFiniteNumber(skill.likeCount),
        isFree: skill.isFree !== false,
        usageInstructions: typeof skill.usageInstructions === 'string' ? skill.usageInstructions : null,
        version: version
          ? {
              versionNo: toFiniteNumber(version.versionNo),
              packageDownloadUrl,
              packageSize: toFiniteNumber(version.packageSize, 0) || null,
            }
          : null,
      }
    },

    /** Install one free skill into <skillRoot>/<normalizedName>. */
    async install(normalizedName) {
      const name = assertSafeNormalizedName(normalizedName)
      const targetPath = resolve(skillRoot, name)
      if (!targetPath.startsWith(resolve(skillRoot) + '/') && targetPath !== resolve(skillRoot)) {
        throw new SkillMarketError('unsafe skill install target')
      }
      if (existsSync(targetPath)) {
        return { status: 'already-installed', normalizedName: name, path: targetPath }
      }
      const detail = await market.detail(name)
      if (!detail.isFree) {
        throw new SkillMarketError('付费技能必须前往 skillpie.cn 技能市场获取 / paid skills must be acquired in the SkillPie marketplace')
      }
      let downloadUrl = detail.version?.packageDownloadUrl ?? null
      if (!downloadUrl) {
        // Detail without a package URL: fall back to the public download-url endpoint.
        const data = await fetchJson(
          fetchImpl,
          joinMarketUrl(baseUrl, `/api/skills/by-normalized-name/${encodeURIComponent(name)}/download-url`),
        )
        downloadUrl = typeof data?.downloadUrl === 'string' && data.downloadUrl !== ''
          ? resolveAbsoluteMarketUrl(baseUrl, data.downloadUrl)
          : null
      }
      if (!downloadUrl) throw new SkillMarketError('skill package download url is unavailable')
      const response = await fetchImpl(downloadUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
      if (!response.ok) throw new SkillMarketError(`skill package download failed (${response.status})`)
      const archive = Buffer.from(await response.arrayBuffer())
      return await installArchive({ archive, normalizedName: name, skillRoot })
    },

    /** List locally installed skills under the skills root. */
    async installed() {
      if (!existsSync(skillRoot)) return []
      const entries = await readdir(skillRoot, { withFileTypes: true })
      const skills = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillFile = join(skillRoot, entry.name, 'SKILL.md')
        if (!existsSync(skillFile)) continue
        let meta = { title: null, description: null, category: null }
        try {
          meta = parseFrontmatter(await readFile(skillFile, 'utf8').then((text) => text.slice(0, 4096)))
        } catch {
          // Unreadable SKILL.md still lists the directory name.
        }
        skills.push({ normalizedName: entry.name, title: meta.title, description: meta.description, category: meta.category })
      }
      skills.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName))
      return skills
    },
  }
  return market
}

/** Extract a downloaded skill zip and copy the SKILL.md directory into place. */
export async function installArchive({ archive, normalizedName, skillRoot }) {
  if (archive.byteLength === 0) throw new SkillMarketError('skill package is empty')
  if (archive.byteLength > MAX_PACKAGE_BYTES) throw new SkillMarketError('skill package exceeds size limit')
  if (!SAFE_NAME.test(normalizedName)) throw new SkillMarketError(`unsafe skill market directory name: ${normalizedName}`)
  const targetPath = resolve(skillRoot, normalizedName)
  if (existsSync(targetPath)) {
    return { status: 'already-installed', normalizedName, path: targetPath }
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'dsh-market-'))
  try {
    const extractRoot = join(tempRoot, 'package')
    await extractZipArchive(archive, extractRoot)
    const sourceDir = await locateSkillDirectory(extractRoot)
    await mkdir(skillRoot, { recursive: true })
    await cp(sourceDir, targetPath, { recursive: true, errorOnExist: true, force: false })
    return { status: 'installed', normalizedName, path: targetPath }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

/** Per-entry path safety + total size / entry count caps, then stream out. */
async function extractZipArchive(archive, targetDir) {
  const zip = await openZipBuffer(archive)
  let extractedBytes = 0
  let entryCount = 0
  const resolvedTarget = resolve(targetDir)

  await new Promise((resolvePromise, rejectPromise) => {
    const fail = (error) => {
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
      try { zip.close() } catch { /* already closed */ }
    }
    const safeTargetFor = (fileName) => {
      if (fileName.startsWith('/') || fileName.includes('\\')) {
        throw new SkillMarketError(`unsafe skill package entry: ${fileName}`)
      }
      const segments = fileName.split('/')
      if (segments.some((segment) => segment === '' || segment === '..' || segment === '.')) {
        throw new SkillMarketError(`unsafe skill package entry: ${fileName}`)
      }
      const target = resolve(resolvedTarget, ...segments)
      if (!target.startsWith(resolvedTarget + '/')) {
        throw new SkillMarketError(`unsafe skill package entry: ${fileName}`)
      }
      return target
    }

    zip.on('error', fail)
    zip.on('entry', (entry) => {
      entryCount += 1
      if (entryCount > MAX_ARCHIVE_ENTRIES) {
        fail(new SkillMarketError('skill package has too many entries'))
        return
      }
      if (extractedBytes + entry.uncompressedSize > MAX_EXTRACTED_BYTES) {
        fail(new SkillMarketError('skill package exceeds extracted size limit'))
        return
      }
      let targetPath
      const isDirectory = entry.fileName.endsWith('/')
      try {
        // Directory entries carry a trailing slash; strip it before the
        // segment check so 'dir/' does not look like an empty segment.
        targetPath = safeTargetFor(isDirectory ? entry.fileName.slice(0, -1) : entry.fileName)
      } catch (error) {
        fail(error)
        return
      }
      void (async () => {
        try {
          if (isDirectory) {
            await mkdir(targetPath, { recursive: true })
          } else {
            const stream = await openZipEntryStream(zip, entry)
            const chunks = []
            for await (const chunk of stream) chunks.push(Buffer.from(chunk))
            const content = Buffer.concat(chunks)
            extractedBytes += content.byteLength
            if (extractedBytes > MAX_EXTRACTED_BYTES) {
              throw new SkillMarketError('skill package exceeds extracted size limit')
            }
            await mkdir(targetPath.slice(0, targetPath.lastIndexOf('/')), { recursive: true })
            await writeFile(targetPath, content)
          }
          zip.readEntry()
        } catch (error) {
          fail(error)
        }
      })()
    })
    zip.on('end', () => resolvePromise())
    zip.readEntry()
  })
  try { zip.close() } catch { /* already closed */ }
}

function openZipBuffer(buffer) {
  return new Promise((resolvePromise, rejectPromise) => {
    fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) {
        rejectPromise(error ?? new Error('failed to open skill package'))
        return
      }
      resolvePromise(zip)
    })
  })
}

function openZipEntryStream(zip, entry) {
  return new Promise((resolvePromise, rejectPromise) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        rejectPromise(error ?? new Error('failed to read skill package entry'))
        return
      }
      resolvePromise(stream)
    })
  })
}

/** The zip root is the skill (SKILL.md at root), or exactly one child dir has it. */
async function locateSkillDirectory(extractRoot) {
  const skillFile = join(extractRoot, 'SKILL.md')
  if (existsSync(skillFile)) return extractRoot
  const candidates = []
  const entries = await readdir(extractRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(extractRoot, entry.name)
    if (existsSync(join(candidate, 'SKILL.md'))) candidates.push(candidate)
  }
  if (candidates.length !== 1) {
    throw new SkillMarketError(
      candidates.length === 0
        ? 'skill package has no SKILL.md'
        : 'skill package has multiple skill directories',
    )
  }
  return candidates[0]
}
