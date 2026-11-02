import { writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function productionDeployment(items, sha) {
  return items.find(d => d.sha === sha && d.creator?.login === 'vercel[bot]' &&
    (d.production_environment === true || d.environment?.toLowerCase() === 'production'));
}
export function deploymentOrigin(value, custom) {
  const url = new URL(value);
  const configured = custom ? new URL(custom).origin : null;
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      (!url.hostname.endsWith('.vercel.app') && url.origin !== configured)) throw new Error('UNTRUSTED_DEPLOYMENT_URL');
  return url.origin;
}
// Use an explicit site URL or the repository's declared homepage; never change
// deployment protection or follow authentication redirects.
export function publicVerificationOrigin(deploymentUrl, configuredUrl, repositoryHomepage) {
  return deploymentOrigin(configuredUrl || repositoryHomepage || deploymentUrl, configuredUrl);
}
async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('INVALID_WORKFLOW_CONTEXT');
  const production = process.env.GITHUB_REF === 'refs/heads/main';
  const result = { workflowCommit: sha, mode: production ? 'production-verification' : 'production-discovery-only', authenticatedSiteRequests: false, checkedAt: new Date().toISOString(), checks: [] };
  async function github(path) {
    // Workflow token goes ONLY to GitHub, never to the app.
    const response = await fetch(`https://api.github.com/repos/${repository}${path ? `/${path}` : ""}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`GITHUB_METADATA_${response.status}`);
    return response.json();
  }
  try {
    let deployment, status;
    for (let attempt = 0; attempt < (production ? 20 : 1); attempt++) {
      const items = await github(`deployments?per_page=100${production ? `&sha=${sha}` : ''}`);
      deployment = production ? productionDeployment(items, sha) : items.find(d => d.creator?.login === 'vercel[bot]' && (d.production_environment === true || d.environment?.toLowerCase() === 'production'));
      if (deployment) {
        const statuses = await github(`deployments/${deployment.id}/statuses`);
        status = statuses[0];
        if (status?.state === 'success') break;
        if (['failure','error'].includes(status?.state)) throw new Error('PRODUCTION_DEPLOYMENT_FAILED');
      }
      if (production) await new Promise(resolve => setTimeout(resolve, 10000));
    }
    if (!deployment || status?.state !== 'success' || !status.environment_url) throw new Error('PRODUCTION_METADATA_NOT_READY');
    const repositoryInfo = await github('');
    const origin = publicVerificationOrigin(status.environment_url, process.env.PUBLIC_APP_URL, repositoryInfo.homepage);
    result.publicUrlSource = process.env.PUBLIC_APP_URL ? 'PUBLIC_APP_URL' : repositoryInfo.homepage ? 'repository-homepage' : 'deployment-url';
    result.generatedDeploymentUrl = deploymentOrigin(status.environment_url, process.env.PUBLIC_APP_URL);
    Object.assign(result, { deploymentId: deployment.id, deploymentSha: deployment.sha, environment: deployment.environment, deploymentState: status.state, url: origin });
    if (!production) return;
    const expected = JSON.parse(await readFile('public/pastoral-release.json','utf8')).release;
    const expectedPrayerMenu = JSON.parse(await readFile('public/prayer-menu-release.json','utf8')).release;
    const expectedDashboard = JSON.parse(await readFile('public/admin-dashboard-release.json','utf8')).release;
    const expectedEmail = JSON.parse(await readFile('public/email-notifications-release.json','utf8')).release;
    const expectedPrayerFollowUp = JSON.parse(await readFile('public/prayer-request-follow-up-release.json','utf8')).release;
    const expectedCommunity = JSON.parse(await readFile('public/community-release.json','utf8')).release;
    const expectedVisitCalendar = JSON.parse(await readFile('public/visit-calendar-release.json','utf8')).release;
    const checks = [
      ['/visit-calendar-release.json',200,'visit-calendar-release'],
      ['/api/visits/availability?month=2026-10',401,'private'],
      ['/visits',307,'redirect'],
      ['/community-release.json',200,'community-release'],
      ['/api/community/folders',401,'private'],
      ['/prayer-request-follow-up-release.json',200,'prayer-follow-up-release'],
      ['/api/prayer-requests',401,'private'],
      ['/api/prayer-requests/unread',401,'private'],
      ['/api/prayer-requests/00000000-0000-4000-8000-000000000001',401,'private','PATCH'],
      ['/api/prayer-requests/00000000-0000-4000-8000-000000000001/comments',401,'private'],
      ['/email-notifications-release.json',200,'email-release'],
      ['/api/admin/email-notifications',403,'private'],
      ['/api/internal/email-notifications',403,'private','POST'],
      ['/admin-dashboard-release.json',200,'dashboard-release'],
      ['/api/admin/dashboard',403,'private'],
      ['/api/admin/pastoral/reports?unreviewed=1',403,'private'],
      ['/about',200,'public-about'], ['/privacy',200,'public-privacy'],
      ['/prayer-menu-release.json',200,'prayer-menu-release'],
      ['/api/prayer-menu',401,'private'], ['/api/admin/prayer/menu-settings',403,'private'],
      ['/pastoral-release.json',200,'release'], ['/login',200,'login'], ['/api/health',200,'health'],
      ['/pastoral-reports',307,'redirect'], ['/admin/pastoral-reports',307,'redirect'],
      ['/api/pastoral/status',401,'private'], ['/api/pastoral/reports',401,'private'],
      ['/api/admin/pastoral/schedule',403,'private'], ['/api/admin/sams/village-leaders',403,'private'],
    ];
    for (const [path, expectedStatus, kind, method = 'GET'] of checks) {
      const response = await fetch(origin + path, { method, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      let passed = response.status === expectedStatus;
      const body = await response.text();
      if (passed && kind === 'email-release') passed = JSON.parse(body).release === expectedEmail;
      if (passed && kind === 'community-release') passed = JSON.parse(body).release === expectedCommunity;
      if (passed && kind === 'visit-calendar-release') passed = JSON.parse(body).release === expectedVisitCalendar;
      if (passed && kind === 'prayer-follow-up-release') passed = JSON.parse(body).release === expectedPrayerFollowUp;
      if (passed && kind === 'prayer-menu-release') passed = JSON.parse(body).release === expectedPrayerMenu;
      if (passed && kind === 'dashboard-release') passed = JSON.parse(body).release === expectedDashboard;
      if (passed && kind === 'release') passed = JSON.parse(body).release === expected;
      if (passed && kind === 'health') { const data = JSON.parse(body); passed = data.status === 'ok' && data.database === 'ok'; }
      if (passed && kind === 'public-about') passed = body.includes('3D') && body.includes('Google Calendar') && body.includes('href="/privacy"');
      if (passed && kind === 'public-privacy') passed = body.includes('개인정보처리방침') && body.includes('calendar.calendarlist.readonly') && body.includes('gmail.send') && body.includes('Limited Use') && body.includes('mailto:ditto0310@gmail.com');
      if (passed && kind === 'login') passed = body.includes('비밀번호');
      if (passed && kind === 'private') passed = ['UNAUTHORIZED','FORBIDDEN'].includes(JSON.parse(body).code);
      if (passed && kind === 'redirect') { const target = new URL(response.headers.get('location') ?? '', origin); passed = target.origin === origin && target.pathname === '/login'; }
      result.checks.push({ path, method, status: response.status, passed });
      if (!passed) throw new Error(`PUBLIC_CHECK_FAILED_${response.status}`);
    }
    result.passed = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : 'VERIFICATION_FAILED';
    process.exitCode = 1;
  } finally {
    // No response bodies, cookies, credentials or member content are written.
    await writeFile('production-readiness.json', JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('PRODUCTION_VERIFICATION_FAILED'); process.exitCode = 1; });
}
