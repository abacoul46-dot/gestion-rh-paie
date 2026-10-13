//go:build windows

// GestionRH.exe : ouvre le logiciel installé dans une fenêtre dédiée
// (Microsoft Edge ou Google Chrome en mode application), puis vérifie
// en arrière-plan si une nouvelle version est disponible.
package main

import (
	"bytes"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gestionrh/win"
)

func navigateur() string {
	pf86, pf, lad := os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")
	for _, p := range []string{
		filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(lad, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(lad, `Google\Chrome\Application\chrome.exe`),
	} {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

// miseAJour télécharge la dernière version du logiciel (remplacée au prochain démarrage).
func miseAJour(page string) {
	cl := &http.Client{Timeout: 25 * time.Second}
	r, err := cl.Get(win.URLWeb + "index.html?t=" + time.Now().Format("20060102150405"))
	if err != nil {
		return
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return
	}
	b, err := io.ReadAll(io.LimitReader(r.Body, 20<<20))
	if err != nil || len(b) < 100000 || !bytes.Contains(b, []byte("SUPA_URL")) || !bytes.HasSuffix(bytes.TrimSpace(b), []byte("</html>")) {
		return
	}
	if old, err := os.ReadFile(page); err == nil && bytes.Equal(old, b) {
		return
	}
	tmp := page + ".nouveau"
	if os.WriteFile(tmp, b, 0644) == nil {
		os.Rename(tmp, page)
	}
}

func main() {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	page := filepath.Join(dir, "app", "index.html")
	if _, err := os.Stat(page); err != nil {
		win.Message("Le logiciel est incomplet (fichier app\\index.html introuvable).\nRéinstallez-le avec Setup-GestionRH-Paie.exe.", win.Nom, win.MB_OK|win.MB_ICONERROR)
		return
	}
	u := url.URL{Scheme: "file", Path: "/" + strings.ReplaceAll(page, `\`, "/")}
	nav := navigateur()
	if nav == "" {
		win.Message("Microsoft Edge ou Google Chrome est nécessaire pour ouvrir "+win.Nom+".\nLe logiciel va s'ouvrir dans votre navigateur par défaut.", win.Nom, win.MB_OK|win.MB_ICONWARN)
		win.Lancer("rundll32.exe", "url.dll,FileProtocolHandler", win.URLWeb)
		return
	}
	os.MkdirAll(win.DossierProfil(), 0755)
	err := win.Lancer(nav, "--app="+u.String(), "--user-data-dir="+win.DossierProfil(),
		"--no-first-run", "--no-default-browser-check", "--disable-features=Translate,msEdgeSidebarV2",
		"--window-size=1366,800")
	if err != nil {
		win.Message("Impossible d'ouvrir le logiciel : "+err.Error(), win.Nom, win.MB_OK|win.MB_ICONERROR)
		return
	}
	miseAJour(page)
}
