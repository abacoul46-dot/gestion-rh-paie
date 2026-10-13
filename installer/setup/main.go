//go:build windows

// Setup-GestionRH-Paie.exe : installe le logiciel pour l'utilisateur Windows
// (sans droits administrateur), crée les raccourcis Bureau et menu Démarrer,
// et l'inscrit dans « Applications installées » pour la désinstallation.
// Le même fichier, copié sous le nom Desinstaller.exe, sert à désinstaller.
package main

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gestionrh/win"
)

//go:embed payload/index.html
var pageApp []byte

//go:embed payload/GestionRH.exe
var lanceur []byte

//go:embed payload/rh.ico
var icone []byte

func ecrire(chemin string, data []byte) error {
	os.MkdirAll(filepath.Dir(chemin), 0755)
	return os.WriteFile(chemin, data, 0644)
}

func installer() {
	dir := win.DossierInstall()
	_, dejaLa := os.Stat(filepath.Join(dir, "GestionRH.exe"))
	titre := "Installation de " + win.Nom + " " + win.Version
	intro := "Bienvenue dans l'installation de " + win.Nom + " " + win.Version + ".\n\nÉditeur : " + win.Editeur +
		"\n\nLe logiciel sera installé dans :\n" + dir +
		"\n\nAu premier démarrage, la clé de licence fournie par " + win.Editeur + " vous sera demandée." +
		"\n\nCliquez sur OK pour installer."
	if dejaLa == nil {
		intro = win.Nom + " est déjà installé sur cet ordinateur.\n\nCliquez sur OK pour le mettre à jour (version " + win.Version + ").\nVotre activation et vos données sont conservées."
	}
	if win.Message(intro, titre, win.MB_OKCANCEL|win.MB_ICONINFO) != win.IDOK {
		return
	}
	self, _ := os.Executable()
	moi, err := os.ReadFile(self)
	if err == nil {
		for _, f := range []struct {
			nom  string
			data []byte
		}{
			{`app\index.html`, pageApp}, {"rh.ico", icone}, {"GestionRH.exe", lanceur}, {"Desinstaller.exe", moi},
		} {
			if err = ecrire(filepath.Join(dir, f.nom), f.data); err != nil {
				break
			}
		}
	}
	if err != nil {
		win.Message("L'installation n'a pas pu copier les fichiers :\n"+err.Error()+"\n\nFermez "+win.Nom+" s'il est ouvert, puis relancez l'installation.", titre, win.MB_OK|win.MB_ICONERROR)
		return
	}
	exe, ico, des := filepath.Join(dir, "GestionRH.exe"), filepath.Join(dir, "rh.ico"), filepath.Join(dir, "Desinstaller.exe")
	script := fmt.Sprintf(`
$sh = New-Object -ComObject WScript.Shell
function Raccourci($chemin) {
  $s = $sh.CreateShortcut($chemin)
  $s.TargetPath = %[1]s; $s.IconLocation = %[2]s + ',0'; $s.WorkingDirectory = %[3]s
  $s.Description = 'Logiciel de paie et de gestion du personnel'; $s.Save()
}
$nom = %[4]s + '.lnk'
Raccourci (Join-Path ([Environment]::GetFolderPath('Desktop')) $nom)
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) %[4]s
New-Item -ItemType Directory -Force -Path $menu | Out-Null
Raccourci (Join-Path $menu $nom)
$d = $sh.CreateShortcut((Join-Path $menu ('Désinstaller ' + $nom)))
$d.TargetPath = %[5]s; $d.Arguments = '/desinstaller'; $d.IconLocation = %[2]s + ',0'; $d.Save()
$k = %[6]s
New-Item -Path $k -Force | Out-Null
Set-ItemProperty -Path $k -Name DisplayName -Value %[4]s
Set-ItemProperty -Path $k -Name DisplayVersion -Value %[7]s
Set-ItemProperty -Path $k -Name Publisher -Value %[8]s
Set-ItemProperty -Path $k -Name DisplayIcon -Value %[2]s
Set-ItemProperty -Path $k -Name InstallLocation -Value %[3]s
Set-ItemProperty -Path $k -Name UninstallString -Value ('"' + %[5]s + '" /desinstaller')
Set-ItemProperty -Path $k -Name NoModify -Value 1 -Type DWord
Set-ItemProperty -Path $k -Name NoRepair -Value 1 -Type DWord
Set-ItemProperty -Path $k -Name EstimatedSize -Value 6000 -Type DWord
`, win.PS(exe), win.PS(ico), win.PS(dir), win.PS(win.Nom), win.PS(des), win.PS(win.CleDesins), win.PS(win.Version), win.PS(win.Editeur))
	if out, err := win.PowerShell(script); err != nil {
		win.Message("Le logiciel est installé, mais les raccourcis n'ont pas pu être créés :\n"+strings.TrimSpace(string(out))+
			"\n\nVous pouvez l'ouvrir avec :\n"+exe, titre, win.MB_OK|win.MB_ICONWARN)
	}
	if win.Message("Installation terminée.\n\nUn raccourci « "+win.Nom+" » a été placé sur le Bureau et dans le menu Démarrer.\n\nVoulez-vous ouvrir le logiciel maintenant ?", titre, win.MB_YESNO|win.MB_ICONINFO) == win.IDYES {
		win.Lancer(exe)
	}
}

func desinstaller() {
	dir := win.DossierInstall()
	titre := "Désinstallation de " + win.Nom
	if win.Message("Désinstaller "+win.Nom+" de cet ordinateur ?\n\nLes données de votre entreprise restent enregistrées en ligne.\n\nSi vous voulez libérer la licence de ce poste pour un autre ordinateur, ouvrez d'abord le logiciel et choisissez Fichier › Désactiver ce poste.", titre, win.MB_YESNO|win.MB_ICONQUEST) != win.IDYES {
		return
	}
	script := fmt.Sprintf(`
$nom = %[1]s + '.lnk'
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Desktop')) $nom)
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Programs')) %[1]s)
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue %[2]s
Get-Process msedge, chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -and (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $_.Id)).CommandLine -like ('*' + %[3]s + '*') } | Stop-Process -Force -ErrorAction SilentlyContinue
`, win.PS(win.Nom), win.PS(win.CleDesins), win.PS(win.DossierProfil()))
	win.PowerShell(script)
	profil := filepath.Dir(win.DossierProfil())
	// Le programme en cours ne peut pas s'effacer lui-même : suppression différée.
	win.LancerCache("cmd.exe", "/c", "ping 127.0.0.1 -n 4 >nul & rmdir /s /q \""+dir+"\" & rmdir /s /q \""+profil+"\"")
	win.Message(win.Nom+" a été désinstallé.", titre, win.MB_OK|win.MB_ICONINFO)
}

func main() {
	for _, a := range os.Args[1:] {
		if strings.EqualFold(a, "/desinstaller") || strings.EqualFold(a, "/uninstall") {
			desinstaller()
			return
		}
	}
	installer()
}
