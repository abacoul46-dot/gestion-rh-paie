//go:build windows

// Fonctions Windows communes au programme d'installation et au lanceur.
package win

import (
	"encoding/base64"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

const (
	Nom       = "Gestion RH & Paie"
	Version   = "2.1"
	Editeur   = "ABA GROUP"
	Dossier   = "GestionRHPaie"
	URLWeb    = "https://abacoul46-dot.github.io/gestion-rh-paie/"
	CleDesins = `HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\GestionRHPaie`

	MB_OK          = 0x0
	MB_OKCANCEL    = 0x1
	MB_YESNO       = 0x4
	MB_ICONERROR   = 0x10
	MB_ICONQUEST   = 0x20
	MB_ICONWARN    = 0x30
	MB_ICONINFO    = 0x40
	MB_SETFOREGRND = 0x10000
	IDOK           = 1
	IDYES          = 6
)

var user32 = syscall.NewLazyDLL("user32.dll")
var msgBox = user32.NewProc("MessageBoxW")

// Message affiche une boîte de dialogue Windows et renvoie le bouton choisi.
func Message(texte, titre string, style uintptr) int {
	t, _ := syscall.UTF16PtrFromString(texte)
	c, _ := syscall.UTF16PtrFromString(titre)
	r, _, _ := msgBox.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), style|MB_SETFOREGRND)
	return int(r)
}

// DossierInstall : %LOCALAPPDATA%\Programs\GestionRHPaie (aucun droit administrateur requis).
func DossierInstall() string {
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", Dossier)
}

// DossierProfil : profil de navigateur dédié au logiciel (données locales, activation du poste).
func DossierProfil() string {
	return filepath.Join(os.Getenv("LOCALAPPDATA"), Dossier, "Profil")
}

func cache(c *exec.Cmd) *exec.Cmd {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

// PowerShell exécute un script sans fenêtre (encodé pour conserver les accents).
func PowerShell(script string) ([]byte, error) {
	u := utf16.Encode([]rune("$ErrorActionPreference='Stop'\n" + script))
	b := make([]byte, len(u)*2)
	for i, v := range u {
		b[2*i] = byte(v)
		b[2*i+1] = byte(v >> 8)
	}
	return cache(exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-EncodedCommand", base64.StdEncoding.EncodeToString(b))).CombinedOutput()
}

// Lancer démarre un programme détaché, sans fenêtre de console.
func Lancer(prog string, args ...string) error {
	c := exec.Command(prog, args...)
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000008 | 0x00000200} // DETACHED_PROCESS | NEW_PROCESS_GROUP
	return c.Start()
}

// LancerCache démarre une commande détachée et invisible (nettoyage après désinstallation).
func LancerCache(prog string, args ...string) error {
	return cache(exec.Command(prog, args...)).Start()
}

// PS échappe une chaîne pour PowerShell (entre apostrophes).
func PS(s string) string {
	out := "'"
	for _, r := range s {
		if r == '\'' {
			out += "''"
		} else {
			out += string(r)
		}
	}
	return out + "'"
}
