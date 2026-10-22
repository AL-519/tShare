import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Lock,
  HardDrive,
  Scale,
  Zap,
  Info,
  Layers,
  FileCheck2,
  FileWarning
} from 'lucide-react';

export const GuidelinesPage = () => {
  useEffect(() => {
    document.title = 'Safety Guidelines & Server Disclaimer — TShare';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 animate-fade-in">
      
      {/* Back Navigation */}
      <div className="mb-6">
        <Link
          to="/"
          id="guidelines-back-btn"
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to File Transfer</span>
        </Link>
      </div>

      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 text-xs font-semibold mb-3">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Security Guidelines & Non-Liability Notice</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4 leading-tight">
          Safety Guidelines & Server Disclaimer
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed">
          TShare is an ephemeral, direct peer-to-peer file transfer platform. Because transfers bypass centralized servers, understanding your responsibilities and the risks of downloading unknown files is essential.
        </p>
      </div>

      {/* High-Priority Warning / Caution Card */}
      <section className="glass-panel rounded-3xl p-6 sm:p-8 border-2 border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20 shadow-xl mb-10" aria-label="Critical Warning">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 mt-1">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Warning: Know Your File Source Before Downloading</span>
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong>Never download or open files received from unknown, untrusted, or unverified individuals.</strong> 
              Anyone who possesses or generates an access code can share files. Because TShare is a zero-knowledge peer-to-peer conduit, files are transferred directly between devices without central virus scanning, content filtering, or authenticity checks.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400/90 font-medium pt-1">
              Opening untrusted files (especially executables, scripts, or archives) can compromise your device, expose private data, or install malicious software. You are solely responsible for verifying the legitimacy of what you download.
            </p>
          </div>
        </div>
      </section>

      {/* Pros & Cons Section */}
      <section className="mb-12 space-y-6" aria-labelledby="pros-cons-heading">
        <div className="text-center max-w-2xl mx-auto">
          <h2 id="pros-cons-heading" className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Pros & Cons of Peer-to-Peer Ephemeral Sharing
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            An honest breakdown of the architectural strengths and inherent risks of direct device transfers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* PROS CARD */}
          <div className="glass-panel rounded-2xl p-6 border border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-950/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-emerald-600 dark:text-emerald-400">The Advantages (Pros)</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Privacy, speed, and zero server storage</p>
              </div>
            </div>

            <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Zero Server Data Storage:</strong> Files are held only in sender browser IndexedDB. Your files are never uploaded or retained on server hard disks.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>No File Size Restrictions:</strong> Direct streaming enables transferring gigabytes of data without artificial cloud upload caps.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Complete Anonymity:</strong> No accounts, logins, phone numbers, or profiling required to share or receive files.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Automated Expiration:</strong> Active links and swarms automatically expire and become inaccessible when the timer completes.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Direct P2P Speed:</strong> Local Wi-Fi and direct WebRTC channels maximize transfer throughput without server bottlenecking.</span>
              </li>
            </ul>
          </div>

          {/* CONS CARD */}
          <div className="glass-panel rounded-2xl p-6 border border-rose-500/25 bg-rose-500/5 dark:bg-rose-950/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-rose-600 dark:text-rose-400">The Risks & Limitations (Cons)</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Lack of central moderation and user-borne risk</p>
              </div>
            </div>

            <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>Zero Server Virus Scanning:</strong> Because the server never sees the unencrypted payload, it cannot scan files for viruses, trojans, or malware.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>Malicious Senders Risk:</strong> Malicious actors may share harmful software, phishing documents, or ransomware under benign file names.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>Dependent on Sender Uptime:</strong> If the sender closes their tab before pieces finish downloading, the transfer terminates.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>Irreversible Execution:</strong> Once an infected file is saved and opened on your computer, the operating system can be compromised.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span><strong>No Central File Recovery:</strong> Expired or deleted files cannot be restored from server backups because no backups exist.</span>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* Strict Server Non-Liability & Disclaimer */}
      <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-300 dark:border-slate-800 space-y-6 mb-10" aria-labelledby="disclaimer-heading">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 id="disclaimer-heading" className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Server Disclaimer & Limitation of Liability
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Legal notice regarding server operations and user responsibility
            </p>
          </div>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              1. Neutral Conduit Status (Zero Knowledge)
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              The TShare server operates solely as an automated WebRTC signaling broker and temporary chunk relay coordinator. The server does not author, inspect, endorse, approve, or curate any files transmitted across the network. All file contents originate entirely from independent user devices.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              2. Absolute Exclusion of Server Liability
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Under no circumstances shall the server, hosting providers, administrators, software developers, or platform maintainers be held liable for any damages, losses, or security incidents resulting from using this software. This includes, without limitation:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 pl-2">
              <li>Malware, virus, trojan, or spyware infections originating from downloaded files</li>
              <li>Data loss, corruption, file encryption, or ransomware incidents</li>
              <li>Hardware failures, operating system crashes, or network disruptions</li>
              <li>Identity theft, credential compromise, or unauthorized system access</li>
              <li>Transmission of copyright-infringing, fraudulent, or illicit material by third parties</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              3. User Assumption of Risk
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              By accessing, browsing, sharing, or downloading any file through TShare, you explicitly acknowledge and agree that your participation is entirely at your own discretion and risk. You agree that you cannot and will not hold the server or its operators liable for any accidents, negligence, malicious acts of other users, or damages arising from downloaded content.
            </p>
          </div>
        </div>
      </section>

      {/* Actionable Safe Downloading Protocols */}
      <section className="glass-card rounded-2xl p-6 sm:p-8 border border-indigo-500/20 space-y-4 mb-10" aria-label="Best practices checklist">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-indigo-400" />
          <span>Recommended Safety Checklist for Users</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-xs text-slate-900 dark:text-slate-200 mb-1">
              ✅ Verify Sender Out-of-Band
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
              Confirm with the sender via phone, SMS, or encrypted messaging that they intentionally generated and provided the 6-character transfer code.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-xs text-slate-900 dark:text-slate-200 mb-1">
              🔍 Inspect File Extension & Size
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
              Beware of unexpected extensions (.exe, .bat, .vbs, .cmd, .scr, .iso, .jar). Never execute files that do not match the expected document or media format.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-xs text-slate-900 dark:text-slate-200 mb-1">
              🛡️ Antivirus Scanning
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
              Always scan downloaded files with an active antivirus / anti-malware solution before unzipping or executing them.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <p className="font-semibold text-xs text-slate-900 dark:text-slate-200 mb-1">
              📁 Use Dedicated Download Folders
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
              Utilize the "Choose Location" download option to save files into an isolated folder rather than system or auto-executing directories.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="text-center pt-4">
        <Link
          to="/"
          id="guidelines-understand-btn"
          className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl"
        >
          <span>I Understand — Return to TShare</span>
          <ArrowLeft className="w-4 h-4 rotate-180" />
        </Link>
      </div>

    </div>
  );
};

export default GuidelinesPage;
