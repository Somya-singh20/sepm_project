/*******************************
 * College Time Scheduler - script.js
 * Roles: Admin, Student, Faculty
 * Storage: localStorage
 * Reminders: 5 minutes before each class (student's department)
 *******************************/

/* ========= DOM ELEMENTS ========= */
const roleSelection   = document.getElementById("roleSelection");
const adminPanel      = document.getElementById("adminPanel");
const studentPanel    = document.getElementById("studentPanel");
const facultyPanel    = document.getElementById("facultyPanel");

// Admin
const adminForm       = document.getElementById("adminForm");
const departmentSelect= document.getElementById("departmentSelect");
const adminDay        = document.getElementById("adminDay");
const startTime       = document.getElementById("startTime"); // (legacy: not used for per-subject; we’ll hide if present)
const endTime         = document.getElementById("endTime");   // (legacy)
const numSubjects     = document.getElementById("numSubjects");
const subjectInputs   = document.getElementById("subjectInputs");
const viewGeneratedBtn= document.getElementById("viewGeneratedBtn");

// Student
const studentLogin    = document.getElementById("studentLogin");
const studentName     = document.getElementById("studentName");
const studentDept     = document.getElementById("studentDept");

// Faculty
const facultyLogin    = document.getElementById("facultyLogin");
const facultyName     = document.getElementById("facultyName");
const facultyTimetableDiv = document.getElementById("facultyTimetable");

// Reminder container (create if missing)
let reminderDiv = document.getElementById("reminder");
if (!reminderDiv) {
  reminderDiv = document.createElement("div");
  reminderDiv.id = "reminder";
  reminderDiv.style.position = "fixed";
  reminderDiv.style.bottom = "20px";
  reminderDiv.style.right = "20px";
  reminderDiv.style.background = "#fffbcc";
  reminderDiv.style.color = "#333";
  reminderDiv.style.padding = "1rem 1.25rem";
  reminderDiv.style.borderRadius = "8px";
  reminderDiv.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2)";
  reminderDiv.style.display = "none";
  reminderDiv.style.zIndex = "1000";
  document.body.appendChild(reminderDiv);
}

/* ========= STATE ========= */
let timetable = JSON.parse(localStorage.getItem("timetable")) || [];
// Active student context for reminders
let activeStudent = {
  name: localStorage.getItem("activeStudentName") || "",
  department: localStorage.getItem("activeDepartment") || ""
};

// Colors for UI chips/cards (deterministic by subject)
const palette = ["#4a90e2","#50e3c2","#f5a623","#9013fe","#e94e77","#7ed321","#b8e986","#f8e71c","#bd10e0","#ff7f50"];

/* ========= NAVIGATION ========= */
function selectRole(role) {
  hideAllPanels();
  roleSelection.classList.add("hidden");
  if (role === "admin")   adminPanel.classList.remove("hidden");
  if (role === "student") studentPanel.classList.remove("hidden");
  if (role === "faculty") facultyPanel.classList.remove("hidden");
}

function goBack() {
  hideAllPanels();
  roleSelection.classList.remove("hidden");
}

function hideAllPanels() {
  adminPanel?.classList.add("hidden");
  studentPanel?.classList.add("hidden");
  facultyPanel?.classList.add("hidden");
}

/* ========= HELPERS ========= */
function saveTimetable() {
  localStorage.setItem("timetable", JSON.stringify(timetable));
}

function setActiveStudent(name, department) {
  activeStudent = { name, department };
  localStorage.setItem("activeStudentName", name);
  localStorage.setItem("activeDepartment", department);
}

// Convert "HH:MM" (24h) -> {h12, mm, ampm, label}
function to12HourLabel(hhmm) {
  let [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = (h % 12) || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// Convert "HH:MM" (24h) -> minutes from midnight
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Pretty label "8:00 AM - 9:00 AM"
function spanLabel(startHHMM, endHHMM) {
  return `${to12HourLabel(startHHMM)} - ${to12HourLabel(endHHMM)}`;
}

// Get weekday name (English) from system
function todayWeekday() {
  return new Date().toLocaleDateString("en-US", { weekday: "long" });
}

// Deterministic color per subject
function colorForSubject(subject) {
  const hash = [...subject].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

// Sort classes by start time
function sortByStart(a, b) {
  return a.startMinutes - b.startMinutes;
}

/* ========= ADMIN: DYNAMIC SUBJECT ROWS (with per-subject times) ========= */
// Hide legacy start/end row (if you included them in HTML, they aren’t needed now)
if (startTime && endTime) {
  startTime.closest("label")?.classList.add("hidden");
  endTime.closest("label")?.classList.add("hidden");
}

numSubjects.addEventListener("input", () => {
  const n = Math.max(0, Math.min(20, parseInt(numSubjects.value || "0", 10)));
  subjectInputs.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "subject-card";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
    row.style.gap = "8px";
    row.style.marginBottom = "8px";
    row.innerHTML = `
      <input type="text" placeholder="Subject ${i + 1}" class="subName" required>
      <input type="text" placeholder="Faculty ${i + 1}" class="facName" required>
      <input type="time" class="subStart" required>
      <input type="time" class="subEnd" required>
    `;
    subjectInputs.appendChild(row);
  }
});

// Admin submit: store EACH subject with its own time slot
adminForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const dept = departmentSelect.value.trim();
  const day  = adminDay.value.trim();
  if (!dept || !day) {
    alert("Please select department and day.");
    return;
  }

  const subNames = Array.from(subjectInputs.querySelectorAll(".subName"));
  const facNames = Array.from(subjectInputs.querySelectorAll(".facName"));
  const starts   = Array.from(subjectInputs.querySelectorAll(".subStart"));
  const ends     = Array.from(subjectInputs.querySelectorAll(".subEnd"));

  // Validate
  if (subNames.length === 0) {
    alert("Please enter at least one subject.");
    return;
  }

  for (let i = 0; i < subNames.length; i++) {
    const subject = subNames[i].value.trim();
    const faculty = facNames[i].value.trim();
    const sTime   = starts[i].value;
    const eTime   = ends[i].value;
    if (!subject || !faculty || !sTime || !eTime) {
      alert("Please fill subject, faculty, start and end time for each entry.");
      return;
    }
    if (toMinutes(eTime) <= toMinutes(sTime)) {
      alert(`End time must be after start time for subject ${i + 1}.`);
      return;
    }
  }

  // Push to timetable
  for (let i = 0; i < subNames.length; i++) {
    const subject = subNames[i].value.trim();
    const faculty = facNames[i].value.trim();
    const sTime   = starts[i].value; // "HH:MM"
    const eTime   = ends[i].value;

    timetable.push({
      department: dept,
      day, // "Monday"..."Saturday"
      subject,
      faculty,
      start: sTime,
      end: eTime,
      startMinutes: toMinutes(sTime),
      endMinutes: toMinutes(eTime),
      timeLabel: spanLabel(sTime, eTime)
    });
  }

  // Persist
  saveTimetable();

  // Reset UI
  adminForm.reset();
  subjectInputs.innerHTML = "";
  alert("Timetable entries added for the selected day!");
});

/* ========= GENERATED TIMETABLE (opens in new window) ========= */
viewGeneratedBtn.addEventListener("click", openGeneratedTimetable);

function openGeneratedTimetable() {
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const departments = [...new Set(timetable.map(t => t.department))].sort();

  let html = `
  <html>
  <head>
    <title>Generated Timetable</title>
    <style>
      body { font-family: Poppins, sans-serif; background: #f3f6f9; padding: 20px; color: #333; }
      h1 { margin: 0 0 10px 0; }
      h2 { margin: 24px 0 8px; }
      table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
      th, td { border: 1px solid #e7e7e7; padding: 10px; text-align: center; vertical-align: top; }
      th { background: #4a90e2; color: #fff; font-weight: 600; }
      .cell { display: flex; flex-direction: column; gap: 8px; }
      .pill {
        padding: 8px 10px; border-radius: 10px; color: #fff; font-weight: 600;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
      }
      .muted { color: #666; font-weight: 500; }
      @media (max-width: 900px) { th, td { font-size: 12px; } }
    </style>
  </head>
  <body>
    <h1>Generated Timetable</h1>
  `;

  departments.forEach((dept) => {
    html += `<h2>${dept} Department</h2>`;
    html += `<table><tr>${days.map(d => `<th>${d}</th>`).join("")}</tr>`;

    // Build columns per day: list all classes (sorted)
    const cols = days.map(day => {
      return timetable
        .filter(t => t.department === dept && t.day === day)
        .sort(sortByStart);
    });

    // Find max list length to determine rows
    const maxRows = Math.max(0, ...cols.map(col => col.length));

    // Render rows
    for (let r = 0; r < maxRows; r++) {
      html += "<tr>";
      for (let c = 0; c < days.length; c++) {
        const cls = cols[c][r];
        if (cls) {
          const color = colorForSubject(cls.subject);
          html += `
            <td>
              <div class="cell">
                <div class="muted">${cls.timeLabel}</div>
                <div class="pill" style="background:${color}">
                  ${cls.subject}<br><span style="font-weight:500">${cls.faculty}</span>
                </div>
              </div>
            </td>`;
        } else {
          html += "<td></td>";
        }
      }
      html += "</tr>";
    }

    html += `</table>`;
  });

  html += `</body></html>`;

  const w = window.open();
  w.document.write(html);
  w.document.close();
}

/* ========= STUDENT LOGIN -> OPEN DEPARTMENT TIMETABLE ========= */
studentLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = studentName.value.trim();
  const dept = studentDept.value.trim();
  if (!name || !dept) {
    alert("Please enter your name and department.");
    return;
  }
  setActiveStudent(name, dept);

  const classes = timetable.filter(t => t.department === dept);
  if (classes.length === 0) {
    alert("No timetable found for your department yet.");
    return;
  }
  openStudentTimetable(name, dept, classes);
});

function openStudentTimetable(name, dept, classes) {
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const cols = days.map(day =>
    classes.filter(c => c.day === day).sort(sortByStart)
  );
  const maxRows = Math.max(0, ...cols.map(col => col.length));

  let html = `
  <html>
  <head>
    <title>${name} - ${dept} Timetable</title>
    <style>
      body { font-family: Poppins, sans-serif; background: #f3f6f9; padding: 20px; color: #333; }
      h1 { margin: 0 0 10px 0; }
      table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
      th, td { border: 1px solid #e7e7e7; padding: 10px; text-align: center; vertical-align: top; }
      th { background: #4a90e2; color: #fff; font-weight: 600; }
      .cell { display: flex; flex-direction: column; gap: 8px; }
      .pill {
        padding: 8px 10px; border-radius: 10px; color: #fff; font-weight: 600;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
      }
      .muted { color: #666; font-weight: 500; }
    </style>
  </head>
  <body>
    <h1>${name} — ${dept} Department</h1>
    <table>
      <tr>${days.map(d => `<th>${d}</th>`).join("")}</tr>
  `;

  for (let r = 0; r < maxRows; r++) {
    html += "<tr>";
    for (let c = 0; c < days.length; c++) {
      const cls = cols[c][r];
      if (cls) {
        const color = colorForSubject(cls.subject);
        html += `
          <td>
            <div class="cell">
              <div class="muted">${cls.timeLabel}</div>
              <div class="pill" style="background:${color}">${cls.subject}<br><span style="font-weight:500">${cls.faculty}</span></div>
            </div>
          </td>`;
      } else {
        html += "<td></td>";
      }
    }
    html += "</tr>";
  }

  html += `</table></body></html>`;

  const w = window.open();
  w.document.write(html);
  w.document.close();
}

/* ========= FACULTY LOGIN -> VIEW MY CLASSES ========= */
facultyLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = facultyName.value.trim();
  if (!name) {
    alert("Please enter your name.");
    return;
  }
  const myClasses = timetable.filter(
    t => t.faculty.toLowerCase() === name.toLowerCase()
  ).sort((a,b) => a.day.localeCompare(b.day) || sortByStart(a,b));

  renderFacultyView(myClasses);
});

function renderFacultyView(classes) {
  facultyTimetableDiv.innerHTML = "";
  if (classes.length === 0) {
    facultyTimetableDiv.innerHTML = "<p>No classes found for you.</p>";
    return;
  }
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const group = {};
  days.forEach(d => group[d] = []);
  classes.forEach(c => group[c.day].push(c));
  days.forEach(d => group[d].sort(sortByStart));

  days.forEach(day => {
    const list = group[day];
    if (list.length === 0) return;
    const h3 = document.createElement("h3");
    h3.textContent = day;
    facultyTimetableDiv.appendChild(h3);

    list.forEach((cls, idx) => {
      const div = document.createElement("div");
      div.className = "faculty-card";
      div.style.background = colorForSubject(cls.subject);
      div.style.marginBottom = "8px";
      div.textContent = `${cls.timeLabel} — ${cls.department} — ${cls.subject}`;
      facultyTimetableDiv.appendChild(div);
    });
  });
}

/* ========= REMINDERS (5 minutes before class) =========
   - Uses student's active department (from last student login)
   - Checks system time and today's weekday
   - Avoids duplicate reminders within the same minute
======================================================= */
const triggeredKeys = new Set(); // keys we've reminded today

function buildReminderKey(entry, dateStr) {
  return `${dateStr}|${entry.department}|${entry.day}|${entry.subject}|${entry.faculty}|${entry.startMinutes}`;
}

function showReminder(message) {
  reminderDiv.textContent = message;
  reminderDiv.style.display = "block";
  // Auto-hide
  setTimeout(() => {
    reminderDiv.style.display = "none";
  }, 10000);
}

function checkReminders() {
  // Only remind for a selected/active department (student’s dept)
  const dept = activeStudent.department || localStorage.getItem("activeDepartment") || "";
  if (!dept) return; // no context -> skip

  const now = new Date();
  const today = now.toLocaleDateString("en-US");
  const weekday = todayWeekday(); // e.g., "Monday"
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Reset dedupe keys daily (simple approach)
  if (!triggeredKeys.has(`DATE:${today}`)) {
    triggeredKeys.clear();
    triggeredKeys.add(`DATE:${today}`);
  }

  // All classes for department on this weekday
  const todayClasses = timetable
    .filter(t => t.department === dept && t.day === weekday)
    .sort(sortByStart);

  todayClasses.forEach(entry => {
    const reminderMinute = entry.startMinutes - 5;
    if (nowMinutes === reminderMinute) {
      const key = buildReminderKey(entry, today);
      if (!triggeredKeys.has(key)) {
        triggeredKeys.add(key);
        showReminder(
          `Reminder: ${entry.subject} by ${entry.faculty} starts at ${entry.timeLabel}`
        );
      }
    }
  });
}

// Run checks frequently to avoid missing minute flips; still trigger only once per key
setInterval(checkReminders, 15000);
// Kick off immediately too
checkReminders();

/* ========= EXPOSE NAV FUNCTIONS FOR BUTTONS ========= */
window.selectRole = selectRole;
window.goBack     = goBack;
