export const glossary = [
  {
    term: "DNS",
    definition:
      "The internet’s address book. DNS translates a name such as example.com into the IP address of your server.",
  },
  {
    term: "Nginx",
    definition:
      "A web server that receives HTTP requests. It can return files itself or forward requests to another application.",
  },
  {
    term: "Reverse proxy",
    definition:
      "A public-facing server that forwards incoming requests to an application running behind it.",
  },
  {
    term: "Static build",
    definition:
      "HTML, CSS and JavaScript generated before a visitor arrives. Nginx can serve these files without running your framework.",
  },
  {
    term: "PHP-FPM",
    definition:
      "A pool of PHP worker processes. Nginx sends PHP requests to these workers over a local socket.",
  },
  {
    term: "systemd",
    definition:
      "Ubuntu’s service manager. It starts an application after boot, restarts it after failures and collects its logs.",
  },
  {
    term: "TLS / HTTPS",
    definition:
      "Encryption and server identity for web traffic. A certificate lets browsers establish an encrypted HTTPS connection.",
  },
  {
    term: "SSH",
    definition:
      "An encrypted terminal connection to another computer. Your private SSH key stays on your own computer.",
  },
  {
    term: "Loopback",
    definition:
      "The address 127.0.0.1 means this computer itself. Binding an application here keeps its port off the public network.",
  },
  {
    term: "Document root",
    definition:
      "The directory Nginx is allowed to serve. This should contain public files, never the whole Laravel repository or environment secrets.",
  },
  {
    term: "Environment variable",
    definition:
      "A named setting provided to a process. Browser build variables are public; server secrets must stay outside public files.",
  },
  {
    term: "sudo",
    definition:
      "Runs one command with administrative privileges. Use it for system settings, not everyday application commands.",
  },
];
