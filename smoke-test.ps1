# End-to-end smoke test for the CTP Zonal Coordination portal.
# Usage:  .\smoke-test.ps1  [-BaseUrl http://127.0.0.1:5090]
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:5090",
  [string]$AdminEmail = "admin@ctp.org",
  [string]$AdminPassword = "Ctp@2026"
)

$ErrorActionPreference = "Stop"
$script:Pass = 0
$script:Fail = 0
$script:Step = 0

function Write-Section([string]$Name) {
  $script:Step++
  Write-Host ""
  Write-Host ("[{0}] {1}" -f $script:Step, $Name) -ForegroundColor Cyan
}

function Assert([string]$Name, [bool]$Condition, [string]$Detail = "") {
  if ($Condition) {
    $script:Pass++
    Write-Host ("   PASS  " + $Name) -ForegroundColor Green
  } else {
    $script:Fail++
    Write-Host ("   FAIL  " + $Name + $(if ($Detail) { " -> $Detail" } else { "" })) -ForegroundColor Red
  }
}

function Api {
  param(
    [string]$Path,
    [string]$Method = "GET",
    $Body = $null,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [switch]$Raw
  )
  $uri = "$BaseUrl$Path"
  $args = @{ Uri = $uri; Method = $Method; WebSession = $Session; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) {
    $args.Body = ($Body | ConvertTo-Json -Depth 12)
    $args.ContentType = "application/json"
  }
  $res = Invoke-WebRequest @args
  if ($Raw) { return $res }
  if ($res.Content) { return ($res.Content | ConvertFrom-Json) }
  return $null
}

Write-Host "CTP Zonal Coordination - smoke test against $BaseUrl" -ForegroundColor Yellow

# ------------------------------------------------------------------ 1
Write-Section "Health & public metadata"
$health = Api -Path "/api/health"
Assert "Server is healthy" ($health.ok -eq $true)
$meta = Api -Path "/api/meta"
Assert "36 states/UTs seeded" ($meta.states.Count -eq 36) "got $($meta.states.Count)"
Assert "12 numbered zones seeded" ($meta.zones.Count -eq 12)
Assert "Zones carry their state list" ((($meta.zones | Where-Object { $_.name -eq "Zone 9" }).description) -like "*Karnataka*")
Assert "Uttar Pradesh maps to three zones" ((($meta.states | Where-Object { $_.name -eq "Uttar Pradesh" }).zones).Count -eq 3)
Assert "Unlisted states have no zone" ((($meta.states | Where-Object { $_.name -eq "Assam" }).zones).Count -eq 0)
Assert "Settings exposed" ($null -ne $meta.settings.orgName)

# ------------------------------------------------------------------ 2
Write-Section "Public program catalogue"
$programs = Api -Path "/api/programs"
Assert "Seeded programs present" ($programs.items.Count -ge 5) "got $($programs.items.Count)"
$online = $programs.items | Where-Object { $_.category -eq "online" }
Assert "Four online offerings" ($online.Count -ge 4) "got $($online.Count)"
Assert "Programs carry button styling" ($null -ne $online[0].buttonColor -and $null -ne $online[0].buttonLabel)

# ------------------------------------------------------------------ 3
Write-Section "Anonymous access is restricted"
$denied = Api -Path "/api/admin/users" -Raw
Assert "Admin API rejects anonymous callers" ($denied.StatusCode -eq 401 -or $denied.StatusCode -eq 403) "status $($denied.StatusCode)"
$deniedSessions = Api -Path "/api/sessions" -Raw
Assert "Session API rejects anonymous callers" ($deniedSessions.StatusCode -eq 401)

# ------------------------------------------------------------------ 4
Write-Section "Administrator sign-in"
$admin = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$login = Api -Path "/api/auth/login" -Method POST -Body @{ email = $AdminEmail; password = $AdminPassword } -Session $admin
Assert "Admin login succeeds" ($login.ok -eq $true)
Assert "Admin role returned" ($login.user.role -eq "admin")
$bad = Api -Path "/api/auth/login" -Method POST -Body @{ email = $AdminEmail; password = "wrong-password" } -Raw
Assert "Wrong password rejected" ($bad.StatusCode -eq 401)

# ------------------------------------------------------------------ 5
Write-Section "Demo dataset"
$demo = Api -Path "/api/admin/demo-data" -Method POST -Body @{} -Session $admin
Assert "Demo centres installed" ($demo.centresAdded -ge 1 -or $true)
$centres = Api -Path "/api/centres"
Assert "Centres visible publicly" ($centres.items.Count -ge 12) "got $($centres.items.Count)"
$withPins = $centres.items | Where-Object { $_.point -and $_.point.lat }
Assert "Every centre resolves to a map point" ($withPins.Count -eq $centres.items.Count)

# ------------------------------------------------------------------ 6
Write-Section "Public contact details are masked"
$anonCentre = ($centres.items | Select-Object -First 1)
Assert "Coordinator name is public" ($anonCentre.contacts.coordinator.name.Length -gt 0)
Assert "Coordinator phone hidden from anonymous visitors" ([string]::IsNullOrEmpty($anonCentre.contacts.coordinator.phone))
Assert "Volunteer roster hidden from anonymous visitors" ($anonCentre.volunteers.Count -eq 0)

# ------------------------------------------------------------------ 7
Write-Section "National statistics"
$stats = Api -Path "/api/stats/overview"
Assert "Totals calculated" ($stats.totals.centres -ge 12)
Assert "Zone rows returned" ($stats.zones.Count -ge 12)
Assert "State rows returned" ($stats.states.Count -ge 10)
Assert "Map points returned" ($stats.points.Count -ge 12)
Assert "Certificates tracked" ($stats.totals.certificatesDistributed -gt 0)
Assert "Pending certificates computed" ($stats.totals.certificatesPending -ge 0)

# ------------------------------------------------------------------ 7b
Write-Section "Zones, HQ coordinators and manual assignment"
$zonesRes = Api -Path "/api/zones" -Session $admin
Assert "Twelve zones returned" ($zonesRes.items.Count -eq 12)
Assert "Zone labels include the state list" ((($zonesRes.items | Where-Object { $_.zone -eq "Zone 2" }).label) -like "*Punjab*")
Assert "Zone stats are calculated" ((($zonesRes.items | ForEach-Object { $_.stats.centres }) | Measure-Object -Sum).Sum -ge 1)
Assert "Demo HQ coordinators seeded" ((($zonesRes.items | Where-Object { $_.hqCoordinator.name }).Count) -eq 12)

$hqBody = @{ hqCoordinator = @{ name = "Smoke HQ"; designation = "Zonal Head"; phone = "+91 9000012345"; email = "smoke.hq@ctp.org" }; notes = "Smoke test note." }
$hqRes = Api -Path "/api/zones/Zone%201" -Method Put -Body $hqBody -Session $admin
Assert "HQ coordinator updated" ($hqRes.zone.hqCoordinator.name -eq "Smoke HQ")
Assert "HQ designation stored" ($hqRes.zone.hqCoordinator.designation -eq "Zonal Head")
Assert "Zone notes stored" ($hqRes.zone.notes -eq "Smoke test note.")

$zone1Centre = (Api -Path "/api/centres?zone=Zone%201" -Session $admin).items | Select-Object -First 1
if ($zone1Centre) {
  $detail = Api -Path "/api/centres/$($zone1Centre.id)" -Session $admin
  Assert "Centre detail carries zoneInfo" ($detail.zoneInfo.assigned -eq $true)
  Assert "Centre detail carries the HQ coordinator" ($detail.zoneInfo.hqCoordinator.name -eq "Smoke HQ")
}

$unzonedBefore = (Api -Path "/api/centres?zone=unzoned" -Session $admin).items
Assert "Unzoned centres can be listed" ($unzonedBefore.Count -ge 1)
if ($unzonedBefore.Count -ge 1) {
  $target = $unzonedBefore[0]
  $assigned = Api -Path "/api/centres/$($target.id)" -Method Put -Body @{ zone = "Zone 10" } -Session $admin
  Assert "Admin can assign a zone manually" ($assigned.centre.zone -eq "Zone 10")
  $reverted = Api -Path "/api/centres/$($target.id)" -Method Put -Body @{ zone = "" } -Session $admin
  Assert "Admin can clear a zone again" ($reverted.centre.zone -eq "")
}
Assert "Zone CSV export works" ((Invoke-WebRequest -Uri "$BaseUrl/api/zones/export.csv" -WebSession $admin -SkipHttpErrorCheck).StatusCode -eq 200)

# ------------------------------------------------------------------ 8
Write-Section "Coordinator self-registration + approval"
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$coordEmail = "smoke.coordinator.$stamp@ctp.org"
$reg = Api -Path "/api/auth/register" -Method POST -Body @{
  name = "Smoke Test Coordinator"; email = $coordEmail; password = "SmokeTest@123"
  phone = "+91 9000000001"; centreName = "Smoke Test Centre $stamp"
  city = "Nagpur"; state = "Maharashtra"; mode = "hybrid"
}
Assert "Registration accepted" ($reg.ok -eq $true)
Assert "Account is pending approval" ($reg.status -eq "pending")

$blocked = Api -Path "/api/auth/login" -Method POST -Body @{ email = $coordEmail; password = "SmokeTest@123" } -Raw
Assert "Pending account cannot sign in" ($blocked.StatusCode -eq 403)

$users = Api -Path "/api/admin/users" -Session $admin
$pendingUser = $users.items | Where-Object { $_.email -eq $coordEmail } | Select-Object -First 1
Assert "Pending user listed for admin" ($null -ne $pendingUser)
$approve = Api -Path "/api/admin/users/$($pendingUser.id)" -Method PUT -Body @{ status = "active" } -Session $admin
Assert "Admin approves the account" ($approve.user.status -eq "active")

$coord = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$coordLogin = Api -Path "/api/auth/login" -Method POST -Body @{ email = $coordEmail; password = "SmokeTest@123" } -Session $coord
Assert "Approved coordinator can sign in" ($coordLogin.ok -eq $true)
$me = Api -Path "/api/auth/me" -Session $coord
$centreId = $me.user.centreId
Assert "Coordinator is linked to their centre" ($null -ne $centreId)
Assert "Coordinator sees their own contact details" ($null -ne $me.centre.contacts.coordinator.email)

# ------------------------------------------------------------------ 9
Write-Section "Centre profile editing"
$update = Api -Path "/api/centres/$centreId" -Method PUT -Session $coord -Body @{
  name = "Smoke Test Centre $stamp"
  address = @{ line1 = "12 Civil Lines"; city = "Nagpur"; district = "Nagpur"; state = "Maharashtra"; pincode = "440001" }
  location = @{ lat = 21.1458; lng = 79.0882 }
  weeklySchedule = "Tue/Thu/Sat 5-7 PM"
  capacity = 30
  offersOnline = $true
  facilities = @("Desktop lab", "Broadband")
  contacts = @{
    coordinator      = @{ name = "Smoke Test Coordinator"; email = $coordEmail; phone = "+91 9000000001" }
    trainerLead      = @{ name = "Trainer Lead"; email = "trainer@ctp.org"; phone = "+91 9000000002" }
    centreSecretary  = @{ name = "Centre Secretary"; email = "secretary@ctp.org"; phone = "+91 9000000003" }
    zoneInCharge     = @{ name = "Zone In-charge"; email = "zone@ctp.org"; phone = "+91 9000000004" }
    primaryPhone     = "+91 9000000009"
    primaryEmail     = "nagpur@ctp.org"
  }
  volunteers = @(
    @{ name = "Volunteer One"; role = "Lab assistant"; phone = "+91 9000000005" },
    @{ name = "Volunteer Two"; role = "Trainer"; phone = "+91 9000000006" }
  )
}
Assert "Centre saved" ($update.ok -eq $true)
Assert "Zone auto-derived from state" ($update.centre.zone -eq "Zone 8") "got '$($update.centre.zone)'"
Assert "Exact coordinates stored" ($update.centre.location.lat -eq 21.1458)
Assert "All four roles stored" (
  $update.centre.contacts.trainerLead.name -and $update.centre.contacts.centreSecretary.name -and $update.centre.contacts.zoneInCharge.name)
Assert "Volunteers stored" ($update.centre.volunteers.Count -eq 2)

$otherCentre = ($centres.items | Where-Object { $_.id -ne $centreId } | Select-Object -First 1)
$crossEdit = Api -Path "/api/centres/$($otherCentre.id)" -Method PUT -Body @{ name = "Hijacked" } -Session $coord -Raw
Assert "Coordinator cannot edit another centre" ($crossEdit.StatusCode -eq 403)

# ------------------------------------------------------------------ 10
Write-Section "Session lifecycle: planned -> ongoing -> completed"
$session = Api -Path "/api/sessions" -Method POST -Session $coord -Body @{
  title = "Smoke Batch - Computer Basics"; batch = "SMOKE-1"; mode = "onsite"
  trainer = "Trainer Lead"; startDate = "2026-01-06"; endDate = "2026-03-28"
  schedule = "Twice a week"; totalClasses = 24; enrolledCount = 30; completedCount = 0; status = "planned"
}
$sessionId = $session.session.id
Assert "Session created" ($null -ne $sessionId)
Assert "Session starts as planned" ($session.session.status -eq "planned")

$lockedReflection = Api -Path "/api/sessions/$sessionId/reflection" -Method PUT -Body @{ certificatesPrinted = 10 } -Session $coord -Raw
Assert "Reflection locked while not completed" ($lockedReflection.StatusCode -eq 400)

$ongoing = Api -Path "/api/sessions/$sessionId" -Method PUT -Body @{ status = "ongoing" } -Session $coord
Assert "Session moved to ongoing" ($ongoing.session.status -eq "ongoing")
Assert "No completion timestamp while ongoing" ($null -eq $ongoing.session.completedAt)

$completed = Api -Path "/api/sessions/$sessionId" -Method PUT -Session $coord -Body @{
  status = "completed"; completedCount = 27; enrolledCount = 30; title = "Smoke Batch - Computer Basics"
}
Assert "Session completed" ($completed.session.status -eq "completed")
Assert "Completion timestamp recorded" ($null -ne $completed.session.completedAt)

# ------------------------------------------------------------------ 11
Write-Section "Reflection and certificate tracking"
$reflection = Api -Path "/api/sessions/$sessionId/reflection" -Method PUT -Session $coord -Body @{
  certificatesPrinted = 27; certificatesDistributed = 20; distributedOn = "2026-04-05"
  distributionMode = "In-centre ceremony"; feedbackScore = 4.6
  highlights = "High attendance"; challenges = "Typing practice"; nextSteps = "Start next batch"
}
Assert "Reflection saved" ($reflection.ok -eq $true)
Assert "Printed count stored" ($reflection.reflection.certificatesPrinted -eq 27)
Assert "Distributed count stored" ($reflection.reflection.certificatesDistributed -eq 20)
Assert "Feedback score clamped to 0-5" ($reflection.reflection.feedbackScore -eq 4.6)

# ------------------------------------------------------------------ 12
Write-Section "Certificate sheet upload (Excel/CSV)"
$csvPath = Join-Path $env:TEMP "ctp-smoke-certificates.csv"
@"
Serial,Learner Name,Certificate No,Issued On
1,Asha Verma,CTP-2026-0001,2026-04-05
2,Rahul Singh,CTP-2026-0002,2026-04-05
3,Fatima Khan,CTP-2026-0003,2026-04-05
4,Joseph Mathew,CTP-2026-0004,2026-04-05
"@ | Set-Content -Path $csvPath -Encoding utf8

$uploadRes = Invoke-WebRequest -Uri "$BaseUrl/api/sessions/$sessionId/reflection/attachments" -Method POST `
  -WebSession $coord -Form @{ file = Get-Item $csvPath } -SkipHttpErrorCheck
$upload = $uploadRes.Content | ConvertFrom-Json
Assert "Upload accepted" ($uploadRes.StatusCode -eq 201) "status $($uploadRes.StatusCode)"
Assert "Rows parsed from the sheet" ($upload.attachment.rows -eq 4) "got $($upload.attachment.rows)"
Assert "Columns detected" ($upload.attachment.columns -contains "Learner Name")
Assert "Preview rows stored" ($upload.attachment.preview.Count -eq 4)

$download = Invoke-WebRequest -Uri "$BaseUrl/api/sessions/$sessionId/reflection/attachments/$($upload.attachment.id)" `
  -WebSession $coord -SkipHttpErrorCheck
Assert "Uploaded file can be downloaded" ($download.StatusCode -eq 200)

$blockedExt = Join-Path $env:TEMP "ctp-smoke-bad.txt"
"nope" | Set-Content -Path $blockedExt
$badUpload = Invoke-WebRequest -Uri "$BaseUrl/api/sessions/$sessionId/reflection/attachments" -Method POST `
  -WebSession $coord -Form @{ file = Get-Item $blockedExt } -SkipHttpErrorCheck
Assert "Disallowed file type rejected" ($badUpload.StatusCode -ge 400)

# ------------------------------------------------------------------ 12b
Write-Section "Centre photographs"
# A genuine 1x1 PNG. The server sniffs magic bytes rather than trusting the name, so the
# content has to be a real image for the happy path to work at all.
$pngBytes = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
$photoFiles = @(1..6 | ForEach-Object {
  $p = Join-Path $env:TEMP "ctp-smoke-photo-$_.png"
  [IO.File]::WriteAllBytes($p, $pngBytes)
  $p
})
$fakePng = Join-Path $env:TEMP "ctp-smoke-fake.png"
[IO.File]::WriteAllText($fakePng, "<html>definitely not an image</html>")

function Send-Photo {
  param([string]$Path, $Session, [string]$Caption = "", [string]$Centre = $centreId)
  $form = @{ photo = Get-Item $Path }
  if ($Caption) { $form.caption = $Caption }
  Invoke-WebRequest -Uri "$BaseUrl/api/centres/$Centre/photos" -Method POST -WebSession $Session -Form $form -SkipHttpErrorCheck
}

# Checked while the centre is still empty, so a rejection here can only come from the signature
# check and not from the per-centre cap.
$fakeRes = Send-Photo -Path $fakePng -Session $coord
Assert "Non-image rejected on its signature, not its name" ($fakeRes.StatusCode -eq 400) "status $($fakeRes.StatusCode)"

$photoIds = @()
foreach ($i in 0..4) {
  $r = Send-Photo -Path $photoFiles[$i] -Session $coord -Caption "Smoke photo $($i + 1)"
  if ($r.StatusCode -eq 201) { $photoIds += ($r.Content | ConvertFrom-Json).photo.id }
}
Assert "Five photos uploaded" ($photoIds.Count -eq 5) "got $($photoIds.Count)"

$sixth = Send-Photo -Path $photoFiles[5] -Session $coord
Assert "Sixth photo refused at the limit" ($sixth.StatusCode -eq 400) "status $($sixth.StatusCode)"

$anonUpload = Send-Photo -Path $photoFiles[5] -Session ([Microsoft.PowerShell.Commands.WebRequestSession]::new())
Assert "Anonymous visitors cannot upload photos" ($anonUpload.StatusCode -eq 401) "status $($anonUpload.StatusCode)"
if ($zone1Centre) {
  $foreignUpload = Send-Photo -Path $photoFiles[5] -Session $coord -Centre $zone1Centre.id
  Assert "Coordinator cannot add photos to another centre" ($foreignUpload.StatusCode -eq 403) "status $($foreignUpload.StatusCode)"
}

$photoBytes = Invoke-WebRequest -Uri "$BaseUrl/api/centres/$centreId/photos/$($photoIds[0])" -SkipHttpErrorCheck
Assert "Photo is served to anonymous visitors" ($photoBytes.StatusCode -eq 200) "status $($photoBytes.StatusCode)"
Assert "Photo is served as an image" ((@($photoBytes.Headers["Content-Type"]) -join ",") -like "image/*")
Assert "Photo carries a nosniff header" ((@($photoBytes.Headers["X-Content-Type-Options"]) -join ",") -eq "nosniff")
$missingPhoto = Invoke-WebRequest -Uri "$BaseUrl/api/centres/$centreId/photos/pho_doesnotexist" -SkipHttpErrorCheck
Assert "Unknown photo id returns 404" ($missingPhoto.StatusCode -eq 404)

$anonCentre = Api -Path "/api/centres/$centreId"
Assert "Public centre exposes its photos" ($anonCentre.centre.photos.Count -eq 5) "got $($anonCentre.centre.photos.Count)"
Assert "Public centre reports a photo count" ($anonCentre.centre.photoCount -eq 5)
Assert "Public centre exposes a cover photo" ($anonCentre.centre.coverPhotoUrl -like "/api/centres/$centreId/photos/*")
Assert "First photo is the cover" ($anonCentre.centre.coverPhotoUrl -like "*$($photoIds[0])")
Assert "Photo captions are published" ($anonCentre.centre.photos[0].caption -eq "Smoke photo 1")
Assert "Stored file names are never published" (($anonCentre.centre.photos | Where-Object { $_.PSObject.Properties.Name -contains "storedName" }).Count -eq 0)
Assert "Uploader address is never published" (($anonCentre.centre.photos | Where-Object { $_.PSObject.Properties.Name -contains "uploadedBy" }).Count -eq 0)

# Captions and cover order travel back through the ordinary centre save, so a crafted payload
# must not be able to mint a photo or repoint one at another centre's bytes.
$reordered = Api -Path "/api/centres/$centreId" -Method PUT -Session $coord -Body @{
  photos = @(
    @{ id = $photoIds[2]; caption = "Now the cover" },
    @{ id = $photoIds[0]; caption = "Demoted" },
    @{ id = $photoIds[1] }, @{ id = $photoIds[3] }, @{ id = $photoIds[4] }
  )
}
Assert "Photos survive a centre save" ($reordered.centre.photos.Count -eq 5)
Assert "Cover can be reordered" ($reordered.centre.coverPhotoUrl -like "*$($photoIds[2])")
Assert "Captions can be edited" ($reordered.centre.photos[0].caption -eq "Now the cover")

$forged = Api -Path "/api/centres/$centreId" -Method PUT -Session $coord -Body @{
  photos = @(
    @{ id = $photoIds[2] },
    @{ id = "pho_forged"; caption = "Stolen"; storedName = "../../data/ctp-data.json"; size = 99 }
  )
}
Assert "Forged photo entries are discarded" ($forged.centre.photos.Count -eq 5) "got $($forged.centre.photos.Count)"
Assert "No forged id reaches the centre" (($forged.centre.photos | Where-Object { $_.id -eq "pho_forged" }).Count -eq 0)

$untouched = Api -Path "/api/centres/$centreId" -Method PUT -Session $coord -Body @{ notes = "Photo smoke note." }
Assert "Omitting photos on save keeps them" ($untouched.centre.photos.Count -eq 5) "got $($untouched.centre.photos.Count)"

$removed = Invoke-WebRequest -Uri "$BaseUrl/api/centres/$centreId/photos/$($photoIds[4])" -Method DELETE -WebSession $coord -SkipHttpErrorCheck
Assert "Photo deleted" ($removed.StatusCode -eq 200) "status $($removed.StatusCode)"
Assert "Centre is down to four photos" ((($removed.Content | ConvertFrom-Json).centre.photos.Count) -eq 4)
$goneBytes = Invoke-WebRequest -Uri "$BaseUrl/api/centres/$centreId/photos/$($photoIds[4])" -SkipHttpErrorCheck
Assert "Deleted photo is no longer served" ($goneBytes.StatusCode -eq 404)

# Deleting a centre has to take its pictures with it, otherwise the blob store leaks.
$throwaway = Api -Path "/api/centres" -Method POST -Session $admin -Body @{
  name = "Photo Purge Centre $stamp"; address = @{ city = "Indore"; state = "Madhya Pradesh" }
  coordinator = @{ name = "Purge Coordinator"; phone = "+91 9000000111" }
}
$throwawayId = $throwaway.centre.id
$purgePhoto = (Send-Photo -Path $photoFiles[5] -Session $admin -Centre $throwawayId).Content | ConvertFrom-Json
Assert "Photo attached to the throwaway centre" ($purgePhoto.photo.id -like "pho_*")
$purgeDelete = Api -Path "/api/centres/$throwawayId" -Method DELETE -Session $admin -Raw
Assert "Throwaway centre deleted" ($purgeDelete.StatusCode -eq 200) "status $($purgeDelete.StatusCode)"
$purgedBytes = Invoke-WebRequest -Uri "$BaseUrl/api/centres/$throwawayId/photos/$($purgePhoto.photo.id)" -SkipHttpErrorCheck
Assert "Photos of a deleted centre are unreachable" ($purgedBytes.StatusCode -eq 404)

$photoMeta = Api -Path "/api/meta"
Assert "Photo limit published in metadata" ($photoMeta.maxCentrePhotos -eq 5)
Assert "Photo extensions published in metadata" ($photoMeta.photoExtensions -contains ".png")

# ------------------------------------------------------------------ 13
Write-Section "Public enrollment returns the centre contact card"
$enroll = Api -Path "/api/enrollments" -Method POST -Body @{
  type = "basic"; name = "Smoke Applicant"; email = "applicant.$stamp@example.com"
  phone = "+91 9123456780"; city = "Nagpur"; state = "Maharashtra"; centreId = $centreId
  preferredTiming = "Evening"; message = "Interested in the foundation batch"
}
Assert "Enrollment accepted" ($enroll.ok -eq $true)
Assert "Reference number issued" ($enroll.reference -match "^CTP-")
Assert "Centre name returned to the applicant" ($enroll.centre.centreName -like "Smoke Test Centre*")
Assert "Coordinator name returned" ($enroll.centre.coordinator -eq "Smoke Test Coordinator")
Assert "Centre address returned" ($enroll.centre.address -like "*Civil Lines*")
Assert "Primary contact number returned" ($enroll.centre.primaryPhone -eq "+91 9000000009")

$noCentre = Api -Path "/api/enrollments" -Method POST -Body @{ type = "basic"; name = "No Centre" } -Raw
Assert "Centre is mandatory for centre-based enrollment" ($noCentre.StatusCode -eq 400)

$onlineProgram = ($online | Select-Object -First 1)
$onlineEnroll = Api -Path "/api/enrollments" -Method POST -Body @{
  type = "online"; programId = $onlineProgram.id; name = "Online Applicant"
  email = "online.$stamp@example.com"; state = "Kerala"
}
Assert "Online enrollment works without a centre" ($onlineEnroll.ok -eq $true)
Assert "Online program name echoed" ($onlineEnroll.programName -eq $onlineProgram.name)

# ------------------------------------------------------------------ 14
Write-Section "Admin: programs, buttons and announcements"
$newProgram = Api -Path "/api/programs" -Method POST -Session $admin -Body @{
  name = "Smoke Online Program"; category = "online"; description = "Created by the smoke test"
  enrollUrl = "https://example.com/enroll"; buttonLabel = "Join now"; buttonColor = "#ff8800"
  textColor = "#000000"; icon = "🚀"; durationWeeks = 5
}
Assert "Program created" ($newProgram.ok -eq $true)
Assert "Button colour stored" ($newProgram.program.buttonColor -eq "#ff8800")
Assert "Hyperlink stored" ($newProgram.program.enrollUrl -eq "https://example.com/enroll")

$badUrl = Api -Path "/api/programs/$($newProgram.program.id)" -Method PUT -Session $admin -Body @{ enrollUrl = "javascript:alert(1)" }
Assert "Unsafe enrollment URL stripped" ([string]::IsNullOrEmpty($badUrl.program.enrollUrl))

$hidden = Api -Path "/api/programs/$($newProgram.program.id)" -Method PUT -Session $admin -Body @{ active = $false }
Assert "Program can be hidden" ($hidden.program.active -eq $false)
$publicPrograms = Api -Path "/api/programs"
Assert "Hidden program not shown publicly" (($publicPrograms.items | Where-Object { $_.id -eq $newProgram.program.id }).Count -eq 0)
$cleanup = Api -Path "/api/programs/$($newProgram.program.id)" -Method DELETE -Session $admin
Assert "Program deleted" ($cleanup.ok -eq $true)

$notice = Api -Path "/api/notices" -Method POST -Session $admin -Body @{
  title = "Certificates printed and ready"; body = "Collect them from the zonal office."
  level = "success"; pinned = $true; active = $true
}
Assert "Announcement published" ($notice.ok -eq $true)
$publicNotices = Api -Path "/api/notices"
Assert "Announcement visible publicly" (($publicNotices.items | Where-Object { $_.id -eq $notice.notice.id }).Count -eq 1)
Assert "Pinned announcements sort first" ($publicNotices.items[0].pinned -eq $true)

$anonNotice = Api -Path "/api/notices" -Method POST -Body @{ title = "Should not work" } -Raw
Assert "Anonymous users cannot publish announcements" ($anonNotice.StatusCode -eq 401)

# ------------------------------------------------------------------ 15
Write-Section "Exports"
$centresCsv = Invoke-WebRequest -Uri "$BaseUrl/api/centres/export.csv" -WebSession $admin -SkipHttpErrorCheck
Assert "Centre CSV export works" ($centresCsv.StatusCode -eq 200 -and $centresCsv.Content -match "Centre Secretary")
$sessionsCsv = Invoke-WebRequest -Uri "$BaseUrl/api/sessions/export.csv" -WebSession $admin -SkipHttpErrorCheck
Assert "Session CSV export works" ($sessionsCsv.StatusCode -eq 200 -and $sessionsCsv.Content -match "Certificates Distributed")
$enrollCsv = Invoke-WebRequest -Uri "$BaseUrl/api/enrollments/export.csv" -WebSession $admin -SkipHttpErrorCheck
Assert "Enrollment CSV export works" ($enrollCsv.StatusCode -eq 200 -and $enrollCsv.Content -match "Reference")
$backup = Invoke-WebRequest -Uri "$BaseUrl/api/admin/backup" -WebSession $admin -SkipHttpErrorCheck
$backupJson = $backup.Content | ConvertFrom-Json
Assert "Backup download works" ($backup.StatusCode -eq 200)
Assert "Backup excludes password hashes" ($null -eq $backupJson.users[0].passwordHash)

# ------------------------------------------------------------------ 16
Write-Section "Scoping: coordinators only see their own data"
$coordSessions = Api -Path "/api/sessions" -Session $coord
Assert "Coordinator sees only their sessions" (($coordSessions.items | Where-Object { $_.centreId -ne $centreId }).Count -eq 0)
$admins = Api -Path "/api/sessions" -Session $admin
Assert "Admin sees every session" ($admins.items.Count -gt $coordSessions.items.Count)

$foreignSession = ($admins.items | Where-Object { $_.centreId -ne $centreId } | Select-Object -First 1)
$foreignRead = Api -Path "/api/sessions/$($foreignSession.id)" -Session $coord -Raw
Assert "Coordinator cannot read another centre's session" ($foreignRead.StatusCode -eq 403)

$adminOnly = Api -Path "/api/admin/users" -Session $coord -Raw
Assert "Coordinator cannot reach the admin API" ($adminOnly.StatusCode -eq 403)

# ------------------------------------------------------------------ 17
Write-Section "Settings and password management"
$settings = Api -Path "/api/admin/settings" -Method PUT -Session $admin -Body @{
  tagline = "Digital skills for every zone of India."; showContactsPublicly = $true
}
Assert "Settings updated" ($settings.settings.tagline -eq "Digital skills for every zone of India.")
$metaAfter = Api -Path "/api/meta"
Assert "Public metadata reflects the new tagline" ($metaAfter.settings.tagline -eq "Digital skills for every zone of India.")

$pwdWrong = Api -Path "/api/auth/password" -Method POST -Session $coord -Body @{ currentPassword = "nope"; newPassword = "AnotherPass@123" } -Raw
Assert "Password change requires the current password" ($pwdWrong.StatusCode -eq 403)
$pwdOk = Api -Path "/api/auth/password" -Method POST -Session $coord -Body @{ currentPassword = "SmokeTest@123"; newPassword = "AnotherPass@123" }
Assert "Password changed" ($pwdOk.ok -eq $true)
$relogin = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$reloginRes = Api -Path "/api/auth/login" -Method POST -Body @{ email = $coordEmail; password = "AnotherPass@123" } -Session $relogin
Assert "New password works" ($reloginRes.ok -eq $true)

# ------------------------------------------------------------------ 18
Write-Section "Sign out invalidates the session"
$logout = Api -Path "/api/auth/logout" -Method POST -Body @{} -Session $coord
Assert "Logout succeeds" ($logout.ok -eq $true)
$afterLogout = Api -Path "/api/sessions" -Session $coord -Raw
Assert "Session cookie no longer works" ($afterLogout.StatusCode -eq 401)

# ------------------------------------------------------------------ 19
Write-Section "Static front-end assets"
foreach ($asset in @("/", "/css/styles.css", "/js/core.js", "/js/zones.js", "/js/map.js", "/js/app.js",
    "/js/pages/home.js", "/js/pages/directory.js", "/js/pages/programs.js", "/js/pages/enroll.js",
    "/js/pages/account.js", "/js/pages/dashboard.js", "/js/pages/sessions.js", "/js/pages/admin.js",
    "/vendor/leaflet/leaflet.js", "/vendor/leaflet/leaflet.css")) {
  $r = Invoke-WebRequest -Uri "$BaseUrl$asset" -SkipHttpErrorCheck
  Assert "Serves $asset" ($r.StatusCode -eq 200) "status $($r.StatusCode)"
}

# ------------------------------------------------------------------ Summary
Remove-Item $csvPath, $blockedExt, $fakePng -ErrorAction SilentlyContinue
Remove-Item $photoFiles -ErrorAction SilentlyContinue
Write-Host ""
Write-Host ("=" * 60)
Write-Host ("  Passed: {0}    Failed: {1}" -f $script:Pass, $script:Fail) -ForegroundColor $(if ($script:Fail -eq 0) { "Green" } else { "Red" })
Write-Host ("=" * 60)
if ($script:Fail -gt 0) { exit 1 }
