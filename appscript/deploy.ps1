# Publie le code ET met a jour le deploiement EXISTANT : l'adresse /exec ne change jamais.
#   .\deploy.ps1          -> clasp push + nouvelle version du deploiement memorise (.deployment-id)
#   .\deploy.ps1 -New     -> cree un NOUVEAU deploiement (nouvelle adresse !) et le memorise
# Sans .deployment-id : si le projet n'a qu'un seul deploiement (hors @HEAD), il est choisi et memorise ; sinon le script s'arrete.
param([switch]$New, [string]$Description = "mise a jour")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
clasp push --force
if ($LASTEXITCODE -ne 0) { throw "clasp push a echoue" }
$idFile = Join-Path $PSScriptRoot ".deployment-id"

if ($New) {
  $out = clasp deploy --description $Description | Out-String
  Write-Host $out
  if ($out -match "(AKfy[\w-]+)") { Set-Content -Path $idFile -Value $Matches[1] -NoNewline; Write-Host "Deploiement memorise : $($Matches[1])" }
  else { Write-Warning "Identifiant non reconnu : notez-le dans .deployment-id" }
  exit 0
}

if (Test-Path $idFile) { $id = (Get-Content $idFile -Raw).Trim() }
else {
  $list = clasp deployments | Out-String
  $ids = [regex]::Matches($list, "(AKfy[\w-]+)\s+@(\d+)") | ForEach-Object { $_.Groups[1].Value }
  if ($ids.Count -eq 1) { $id = $ids[0]; Set-Content -Path $idFile -Value $id -NoNewline; Write-Host "Deploiement choisi et memorise : $id" }
  else { Write-Host $list; throw "Pas de .deployment-id et $($ids.Count) deploiements : copiez l'identifiant voulu dans appscript\.deployment-id (Set-Content -NoNewline), ou lancez .\deploy.ps1 -New." }
}
clasp deploy --deploymentId $id --description $Description
if ($LASTEXITCODE -ne 0) {
  Write-Warning "clasp n'a pas pu mettre a jour le deploiement $id."
  Write-Host "Solution de secours (le code est deja envoye) : editeur Apps Script -> Deployer -> Gerer les deploiements -> crayon -> Version : Nouvelle version -> Deployer (meme adresse)."
  clasp deployments
  exit 1
}
Write-Host "Termine : $id mis a jour (l'adresse /exec ne change pas)."
