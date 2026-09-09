const ExcelJS = require('exceljs');
const path = require('path');

const outputPath = path.resolve(__dirname, '..', 'manager-roadmap-gantts-import-he.xlsx');

const projects = [
  {
    id: 'newsletter',
    title: 'Newsletter Product Roadmap',
    department: 'Newsletter',
    division: 'Product Delivery',
    field: 'Content publishing and audience communication',
    description: 'Manager-facing roadmap based on commits from 2026-03-30 through 2026-05-03, extended through September for rollout and acceptance.',
    status: 'In Progress',
    due: '2026-09-30',
    roles: [
      ['Product Manager', 0, 'monthly', 'ILS'],
      ['Content Lead', 0, 'monthly', 'ILS'],
      ['Frontend Developer', 0, 'monthly', 'ILS'],
      ['Backend Developer', 0, 'monthly', 'ILS'],
      ['QA / Release Lead', 0, 'monthly', 'ILS'],
    ],
    resources: [
      ['Product Owner', 'Product Manager', '#D93A3A', 100],
      ['Newsletter Editor', 'Content Lead', '#2563EB', 100],
      ['Application Team', 'Frontend Developer', '#059669', 100],
      ['Platform Team', 'Backend Developer', '#7C3AED', 100],
      ['Release Coordinator', 'QA / Release Lead', '#EA580C', 100],
    ],
    goals: [
      ['Newsletter workspace ready', '2026-03-31', 100, 'completed'],
      ['Deployment and mail foundation ready', '2026-04-13', 100, 'completed'],
      ['Rich media and subscription flow ready', '2026-05-03', 100, 'completed'],
      ['Manager acceptance complete', '2026-09-30', 0, 'pending'],
    ],
    tasks: [
      ['1', 'Newsletter product foundation', '2026-03-30', 2, 100, 'Completed', 'No', 'Product Owner', ''],
      ['1.1', 'Define newsletter home experience', '2026-03-30', 1, 100, 'Completed', 'No', 'Product Owner', ''],
      ['1.2', 'Set up manager workspace baseline', '2026-03-30', 1, 100, 'Completed', 'No', 'Application Team', '1.1'],
      ['1.3', 'Milestone: first usable newsletter app', '2026-03-31', 0, 100, 'Completed', 'Yes', 'Product Owner', '1.2'],
      ['2', 'Newsletter management workspace', '2026-03-31', 4, 100, 'Completed', 'No', 'Newsletter Editor', '1.3'],
      ['2.1', 'Create newsletter list and editor management', '2026-03-31', 1, 100, 'Completed', 'No', 'Newsletter Editor', '1.3'],
      ['2.2', 'Move newsletter data to managed database', '2026-03-31', 1, 100, 'Completed', 'No', 'Platform Team', '2.1'],
      ['2.3', 'Add migration support for existing content', '2026-03-31', 1, 100, 'Completed', 'No', 'Platform Team', '2.2'],
      ['2.4', 'Support Hebrew and right-to-left publishing', '2026-03-31', 1, 100, 'Completed', 'No', 'Application Team', '2.3'],
      ['2.5', 'Milestone: editors can manage newsletters', '2026-03-31', 0, 100, 'Completed', 'Yes', 'Newsletter Editor', '2.4'],
      ['3', 'Navigation and publishing operations', '2026-04-01', 9, 100, 'Completed', 'No', 'Platform Team', '2.5'],
      ['3.1', 'Add navigation links management', '2026-04-01', 1, 100, 'Completed', 'No', 'Product Owner', '2.5'],
      ['3.2', 'Add startup logging for easier support', '2026-04-12', 1, 100, 'Completed', 'No', 'Release Coordinator', '3.1'],
      ['3.3', 'Package app for deployment', '2026-04-12', 1, 100, 'Completed', 'No', 'Platform Team', '3.2'],
      ['3.4', 'Prepare mail settings synchronization', '2026-04-13', 1, 100, 'Completed', 'No', 'Platform Team', '3.3'],
      ['3.5', 'Prepare Kubernetes deployment option', '2026-04-13', 1, 100, 'Completed', 'No', 'Platform Team', '3.4'],
      ['3.6', 'Milestone: operational foundation ready', '2026-04-13', 0, 100, 'Completed', 'Yes', 'Release Coordinator', '3.5'],
      ['4', 'Rich newsletter content experience', '2026-04-19', 10, 100, 'Completed', 'No', 'Application Team', '3.6'],
      ['4.1', 'Add embedded media support', '2026-04-19', 1, 100, 'Completed', 'No', 'Application Team', '3.6'],
      ['4.2', 'Improve PowerPoint preview behavior', '2026-04-20', 2, 100, 'Completed', 'No', 'Application Team', '4.1'],
      ['4.3', 'Improve newsletter display reliability', '2026-04-20', 1, 100, 'Completed', 'No', 'Application Team', '4.2'],
      ['4.4', 'Improve deployment path compatibility', '2026-04-20', 1, 100, 'Completed', 'No', 'Platform Team', '4.3'],
      ['4.5', 'Add full-screen preview polish', '2026-05-03', 1, 100, 'Completed', 'No', 'Application Team', '4.4'],
      ['4.6', 'Milestone: rich media newsletters ready', '2026-05-03', 0, 100, 'Completed', 'Yes', 'Newsletter Editor', '4.5'],
      ['5', 'Audience subscription flow', '2026-05-02', 5, 100, 'Completed', 'No', 'Product Owner', '4.6'],
      ['5.1', 'Implement subscribe and unsubscribe path', '2026-05-02', 1, 100, 'Completed', 'No', 'Platform Team', '4.6'],
      ['5.2', 'Improve error handling for newsletter operations', '2026-05-03', 1, 100, 'Completed', 'No', 'Application Team', '5.1'],
      ['5.3', 'Improve navigation sync feedback', '2026-05-03', 1, 100, 'Completed', 'No', 'Release Coordinator', '5.2'],
      ['5.4', 'Milestone: audience self-service ready', '2026-05-03', 0, 100, 'Completed', 'Yes', 'Product Owner', '5.3'],
      ['6', 'Manager rollout and adoption', '2026-05-04', 108, 0, 'Pending', 'No', 'Release Coordinator', '5.4'],
      ['6.1', 'Review newsletter flows with manager', '2026-05-04', 10, 0, 'Pending', 'No', 'Product Owner', '5.4'],
      ['6.2', 'Prepare sample newsletter content pack', '2026-05-18', 15, 0, 'Pending', 'No', 'Newsletter Editor', '6.1'],
      ['6.3', 'Run publishing and email checks', '2026-06-08', 20, 0, 'Pending', 'No', 'Release Coordinator', '6.2'],
      ['6.4', 'Train editors and collect feedback', '2026-07-06', 25, 0, 'Pending', 'No', 'Newsletter Editor', '6.3'],
      ['6.5', 'Complete final fixes and documentation', '2026-08-10', 25, 0, 'Pending', 'No', 'Application Team', '6.4'],
      ['6.6', 'Milestone: newsletter manager sign-off', '2026-09-30', 0, 0, 'Pending', 'Yes', 'Product Owner', '6.5'],
    ],
  },
  {
    id: 'gantt',
    title: 'Gantt Planning Roadmap',
    department: 'Planning',
    division: 'Manager Tools',
    field: 'Project schedules, milestones, and spreadsheet import',
    description: 'Manager-facing roadmap based on Gantt-related commits from 2026-03-30 through 2026-05-03, extended through September for adoption.',
    status: 'In Progress',
    due: '2026-09-30',
    roles: [
      ['Product Manager', 0, 'monthly', 'ILS'],
      ['Planning Lead', 0, 'monthly', 'ILS'],
      ['Frontend Developer', 0, 'monthly', 'ILS'],
      ['Data / Spreadsheet Owner', 0, 'monthly', 'ILS'],
      ['QA / Release Lead', 0, 'monthly', 'ILS'],
    ],
    resources: [
      ['Product Owner', 'Product Manager', '#D93A3A', 100],
      ['Planning Owner', 'Planning Lead', '#2563EB', 100],
      ['Application Team', 'Frontend Developer', '#059669', 100],
      ['Spreadsheet Owner', 'Data / Spreadsheet Owner', '#7C3AED', 100],
      ['Release Coordinator', 'QA / Release Lead', '#EA580C', 100],
    ],
    goals: [
      ['Planning data model ready', '2026-03-30', 100, 'completed'],
      ['Gantt editor and import ready', '2026-03-31', 100, 'completed'],
      ['Spreadsheet compatibility improved', '2026-05-02', 100, 'completed'],
      ['Gantt rollout accepted', '2026-09-30', 0, 'pending'],
    ],
    tasks: [
      ['1', 'Planning tool foundation', '2026-03-30', 3, 100, 'Completed', 'No', 'Planning Owner', ''],
      ['1.1', 'Define schedule task structure', '2026-03-30', 1, 100, 'Completed', 'No', 'Planning Owner', ''],
      ['1.2', 'Add roles, resources, and project structure', '2026-03-30', 1, 100, 'Completed', 'No', 'Application Team', '1.1'],
      ['1.3', 'Build first timeline view', '2026-03-30', 1, 100, 'Completed', 'No', 'Application Team', '1.2'],
      ['1.4', 'Milestone: first Gantt timeline visible', '2026-03-30', 0, 100, 'Completed', 'Yes', 'Planning Owner', '1.3'],
      ['2', 'Portfolio planning workspace', '2026-03-31', 5, 100, 'Completed', 'No', 'Product Owner', '1.4'],
      ['2.1', 'Connect Gantt plans to projects', '2026-03-31', 1, 100, 'Completed', 'No', 'Application Team', '1.4'],
      ['2.2', 'Add import path for planning data', '2026-03-31', 1, 100, 'Completed', 'No', 'Spreadsheet Owner', '2.1'],
      ['2.3', 'Create dedicated timeline editor', '2026-03-31', 1, 100, 'Completed', 'No', 'Application Team', '2.2'],
      ['2.4', 'Support daily planning costs', '2026-03-31', 1, 100, 'Completed', 'No', 'Planning Owner', '2.3'],
      ['2.5', 'Milestone: managers can edit project timelines', '2026-03-31', 0, 100, 'Completed', 'Yes', 'Product Owner', '2.4'],
      ['3', 'Localization and usability polish', '2026-03-31', 4, 100, 'Completed', 'No', 'Application Team', '2.5'],
      ['3.1', 'Support Hebrew and right-to-left schedules', '2026-03-31', 1, 100, 'Completed', 'No', 'Application Team', '2.5'],
      ['3.2', 'Fix timeline grid resizing for RTL use', '2026-03-31', 1, 100, 'Completed', 'No', 'Application Team', '3.1'],
      ['3.3', 'Improve manager navigation around planning screens', '2026-04-01', 1, 100, 'Completed', 'No', 'Product Owner', '3.2'],
      ['3.4', 'Milestone: localized planning experience ready', '2026-04-01', 0, 100, 'Completed', 'Yes', 'Planning Owner', '3.3'],
      ['4', 'Spreadsheet planning workflow', '2026-05-02', 5, 100, 'Completed', 'No', 'Spreadsheet Owner', '3.4'],
      ['4.1', 'Improve spreadsheet-style planning view', '2026-05-02', 1, 100, 'Completed', 'No', 'Spreadsheet Owner', '3.4'],
      ['4.2', 'Fix Excel date handling', '2026-05-02', 1, 100, 'Completed', 'No', 'Spreadsheet Owner', '4.1'],
      ['4.3', 'Improve right-to-left spreadsheet support', '2026-05-02', 1, 100, 'Completed', 'No', 'Application Team', '4.2'],
      ['4.4', 'Milestone: spreadsheet import/export ready', '2026-05-02', 0, 100, 'Completed', 'Yes', 'Spreadsheet Owner', '4.3'],
      ['5', 'Planning quality controls', '2026-05-03', 4, 100, 'Completed', 'No', 'Release Coordinator', '4.4'],
      ['5.1', 'Warn before leaving unsaved changes', '2026-05-03', 1, 100, 'Completed', 'No', 'Application Team', '4.4'],
      ['5.2', 'Warn about empty task names', '2026-05-03', 1, 100, 'Completed', 'No', 'Release Coordinator', '5.1'],
      ['5.3', 'Handle milestone task duration correctly', '2026-05-03', 1, 100, 'Completed', 'No', 'Planning Owner', '5.2'],
      ['5.4', 'Milestone: safer timeline editing ready', '2026-05-03', 0, 100, 'Completed', 'Yes', 'Release Coordinator', '5.3'],
      ['6', 'Manager rollout and adoption', '2026-05-04', 108, 0, 'Pending', 'No', 'Product Owner', '5.4'],
      ['6.1', 'Turn commit history into manager roadmap', '2026-05-04', 10, 0, 'Pending', 'No', 'Product Owner', '5.4'],
      ['6.2', 'Validate import workbook with sample projects', '2026-05-18', 15, 0, 'Pending', 'No', 'Spreadsheet Owner', '6.1'],
      ['6.3', 'Review milestones with management', '2026-06-08', 20, 0, 'Pending', 'No', 'Planning Owner', '6.2'],
      ['6.4', 'Train team on updating the Gantt', '2026-07-06', 25, 0, 'Pending', 'No', 'Planning Owner', '6.3'],
      ['6.5', 'Complete planning governance and handover', '2026-08-10', 25, 0, 'Pending', 'No', 'Release Coordinator', '6.4'],
      ['6.6', 'Milestone: Gantt process accepted', '2026-09-30', 0, 0, 'Pending', 'Yes', 'Product Owner', '6.5'],
    ],
  },
];

const he = new Map([
  ['Newsletter Product Roadmap', 'מפת דרכים למוצר הניוזלטר'],
  ['Newsletter', 'ניוזלטר'],
  ['Product Delivery', 'הובלת מוצר'],
  ['Content publishing and audience communication', 'פרסום תוכן ותקשורת עם קהל'],
  ['Manager-facing roadmap based on commits from 2026-03-30 through 2026-05-03, extended through September for rollout and acceptance.', 'מפת דרכים ניהולית המבוססת על קומיטים מ-2026-03-30 עד 2026-05-03, עם המשך עד ספטמבר לטובת הטמעה ואישור.'],
  ['Gantt Planning Roadmap', 'מפת דרכים לתכנון גאנט'],
  ['Planning', 'תכנון'],
  ['Manager Tools', 'כלי ניהול'],
  ['Project schedules, milestones, and spreadsheet import', 'לוחות זמנים, אבני דרך וייבוא מגיליונות'],
  ['Manager-facing roadmap based on Gantt-related commits from 2026-03-30 through 2026-05-03, extended through September for adoption.', 'מפת דרכים ניהולית המבוססת על קומיטים בתחום הגאנט מ-2026-03-30 עד 2026-05-03, עם המשך עד ספטמבר לאימוץ.'],
  ['Product Manager', 'מנהל מוצר'],
  ['Content Lead', 'מוביל תוכן'],
  ['Frontend Developer', 'מפתח ממשק משתמש'],
  ['Backend Developer', 'מפתח צד שרת'],
  ['QA / Release Lead', 'מוביל בדיקות ושחרור'],
  ['Planning Lead', 'מוביל תכנון'],
  ['Data / Spreadsheet Owner', 'אחראי נתונים וגיליונות'],
  ['Product Owner', 'אחראי מוצר'],
  ['Newsletter Editor', 'עורך ניוזלטר'],
  ['Application Team', 'צוות אפליקציה'],
  ['Platform Team', 'צוות פלטפורמה'],
  ['Release Coordinator', 'רכז שחרור'],
  ['Planning Owner', 'אחראי תכנון'],
  ['Spreadsheet Owner', 'אחראי גיליונות'],
  ['Newsletter workspace ready', 'סביבת העבודה של הניוזלטר מוכנה'],
  ['Deployment and mail foundation ready', 'תשתית פריסה ודואר מוכנה'],
  ['Rich media and subscription flow ready', 'מדיה עשירה ותהליך הרשמה מוכנים'],
  ['Manager acceptance complete', 'אישור מנהל הושלם'],
  ['Planning data model ready', 'מודל נתוני התכנון מוכן'],
  ['Gantt editor and import ready', 'עורך הגאנט והייבוא מוכנים'],
  ['Spreadsheet compatibility improved', 'שופרה התאימות לגיליונות'],
  ['Gantt rollout accepted', 'הטמעת הגאנט אושרה'],
  ['Newsletter product foundation', 'יסודות מוצר הניוזלטר'],
  ['Define newsletter home experience', 'הגדרת חוויית דף הבית של הניוזלטר'],
  ['Set up manager workspace baseline', 'הקמת בסיס סביבת העבודה למנהל'],
  ['Milestone: first usable newsletter app', 'אבן דרך: אפליקציית ניוזלטר ראשונה לשימוש'],
  ['Newsletter management workspace', 'סביבת ניהול הניוזלטר'],
  ['Create newsletter list and editor management', 'יצירת ניהול רשימת ניוזלטרים ועורך'],
  ['Move newsletter data to managed database', 'העברת נתוני הניוזלטר למסד נתונים מנוהל'],
  ['Add migration support for existing content', 'הוספת תמיכה בהעברת תוכן קיים'],
  ['Support Hebrew and right-to-left publishing', 'תמיכה בעברית ובפרסום מימין לשמאל'],
  ['Milestone: editors can manage newsletters', 'אבן דרך: עורכים יכולים לנהל ניוזלטרים'],
  ['Navigation and publishing operations', 'ניווט ותפעול פרסום'],
  ['Add navigation links management', 'הוספת ניהול קישורי ניווט'],
  ['Add startup logging for easier support', 'הוספת רישום הפעלה לתמיכה פשוטה יותר'],
  ['Package app for deployment', 'אריזת האפליקציה לפריסה'],
  ['Prepare mail settings synchronization', 'הכנת סנכרון הגדרות דואר'],
  ['Prepare Kubernetes deployment option', 'הכנת אפשרות פריסה בקוברנטיס'],
  ['Milestone: operational foundation ready', 'אבן דרך: התשתית התפעולית מוכנה'],
  ['Rich newsletter content experience', 'חוויית תוכן עשירה בניוזלטר'],
  ['Add embedded media support', 'הוספת תמיכה במדיה מוטמעת'],
  ['Improve PowerPoint preview behavior', 'שיפור תצוגה מקדימה של PowerPoint'],
  ['Improve newsletter display reliability', 'שיפור אמינות תצוגת הניוזלטר'],
  ['Improve deployment path compatibility', 'שיפור תאימות נתיבי פריסה'],
  ['Add full-screen preview polish', 'ליטוש תצוגה מקדימה במסך מלא'],
  ['Milestone: rich media newsletters ready', 'אבן דרך: ניוזלטרים עם מדיה עשירה מוכנים'],
  ['Audience subscription flow', 'תהליך הרשמת קהל'],
  ['Implement subscribe and unsubscribe path', 'מימוש תהליך הרשמה והסרה'],
  ['Improve error handling for newsletter operations', 'שיפור טיפול בשגיאות בפעולות ניוזלטר'],
  ['Improve navigation sync feedback', 'שיפור משוב על סנכרון ניווט'],
  ['Milestone: audience self-service ready', 'אבן דרך: שירות עצמי לקהל מוכן'],
  ['Manager rollout and adoption', 'הטמעה ואימוץ אצל מנהלים'],
  ['Review newsletter flows with manager', 'סקירת תהליכי הניוזלטר עם המנהל'],
  ['Prepare sample newsletter content pack', 'הכנת חבילת תוכן לדוגמה לניוזלטר'],
  ['Run publishing and email checks', 'ביצוע בדיקות פרסום ודואר'],
  ['Train editors and collect feedback', 'הדרכת עורכים ואיסוף משוב'],
  ['Complete final fixes and documentation', 'השלמת תיקונים אחרונים ותיעוד'],
  ['Milestone: newsletter manager sign-off', 'אבן דרך: אישור מנהל לניוזלטר'],
  ['Planning tool foundation', 'יסודות כלי התכנון'],
  ['Define schedule task structure', 'הגדרת מבנה משימות לוח הזמנים'],
  ['Add roles, resources, and project structure', 'הוספת תפקידים, משאבים ומבנה פרויקט'],
  ['Build first timeline view', 'בניית תצוגת ציר זמן ראשונה'],
  ['Milestone: first Gantt timeline visible', 'אבן דרך: ציר זמן גאנט ראשון מוצג'],
  ['Portfolio planning workspace', 'סביבת תכנון לפורטפוליו'],
  ['Connect Gantt plans to projects', 'חיבור תוכניות גאנט לפרויקטים'],
  ['Add import path for planning data', 'הוספת מסלול ייבוא לנתוני תכנון'],
  ['Create dedicated timeline editor', 'יצירת עורך ייעודי לציר זמן'],
  ['Support daily planning costs', 'תמיכה בעלויות תכנון יומיות'],
  ['Milestone: managers can edit project timelines', 'אבן דרך: מנהלים יכולים לערוך לוחות זמנים'],
  ['Localization and usability polish', 'לוקליזציה וליטוש שימושיות'],
  ['Support Hebrew and right-to-left schedules', 'תמיכה בעברית ובלוחות זמנים מימין לשמאל'],
  ['Fix timeline grid resizing for RTL use', 'תיקון שינוי גודל רשת ציר הזמן לשימוש מימין לשמאל'],
  ['Improve manager navigation around planning screens', 'שיפור ניווט מנהלים במסכי התכנון'],
  ['Milestone: localized planning experience ready', 'אבן דרך: חוויית תכנון מקומית מוכנה'],
  ['Spreadsheet planning workflow', 'תהליך תכנון בגיליונות'],
  ['Improve spreadsheet-style planning view', 'שיפור תצוגת תכנון בסגנון גיליון'],
  ['Fix Excel date handling', 'תיקון טיפול בתאריכי Excel'],
  ['Improve right-to-left spreadsheet support', 'שיפור תמיכה בגיליונות מימין לשמאל'],
  ['Milestone: spreadsheet import/export ready', 'אבן דרך: ייבוא וייצוא גיליונות מוכנים'],
  ['Planning quality controls', 'בקרות איכות לתכנון'],
  ['Warn before leaving unsaved changes', 'אזהרה לפני יציאה משינויים שלא נשמרו'],
  ['Warn about empty task names', 'אזהרה על שמות משימות ריקים'],
  ['Handle milestone task duration correctly', 'טיפול נכון במשך של אבני דרך'],
  ['Milestone: safer timeline editing ready', 'אבן דרך: עריכת ציר זמן בטוחה יותר מוכנה'],
  ['Turn commit history into manager roadmap', 'המרת היסטוריית קומיטים למפת דרכים ניהולית'],
  ['Validate import workbook with sample projects', 'אימות קובץ הייבוא עם פרויקטים לדוגמה'],
  ['Review milestones with management', 'סקירת אבני דרך עם ההנהלה'],
  ['Train team on updating the Gantt', 'הדרכת הצוות לעדכון הגאנט'],
  ['Complete planning governance and handover', 'השלמת נהלי תכנון והעברת אחריות'],
  ['Milestone: Gantt process accepted', 'אבן דרך: תהליך הגאנט אושר'],
]);

function tr(value) {
  return he.get(value) ?? value;
}

function asDate(value) {
  return value;
}

function applyRtl(ws) {
  ws.views = [{ rightToLeft: true }];
}

function styleHeader(ws) {
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: 'FF737373' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } } };
  });
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Codex';
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const projectsWs = wb.addWorksheet('Projects');
  applyRtl(projectsWs);
  projectsWs.columns = [
    { header: 'Title', key: 'title', width: 34 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Division', key: 'division', width: 18 },
    { header: 'Field', key: 'field', width: 36 },
    { header: 'Description', key: 'description', width: 72 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Due Date', key: 'due', width: 15 },
  ];
  styleHeader(projectsWs);

  const projectRowById = new Map();
  projects.forEach((project, index) => {
    projectRowById.set(project.id, index + 2);
    projectsWs.addRow({
      title: tr(project.title),
      department: tr(project.department),
      division: tr(project.division),
      field: tr(project.field),
      description: tr(project.description),
      status: project.status,
      due: asDate(project.due),
    });
  });
  projectsWs.getColumn(7).numFmt = 'yyyy-mm-dd';

  const projectRef = (project) => ({
    formula: `Projects!$A$${projectRowById.get(project.id)}`,
    result: tr(project.title),
  });

  const goalsWs = wb.addWorksheet('Goals');
  applyRtl(goalsWs);
  goalsWs.columns = [
    { header: 'Project', key: 'project', width: 34 },
    { header: 'Milestone', key: 'milestone', width: 44 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Progress (%)', key: 'progress', width: 14 },
    { header: 'Status', key: 'status', width: 15 },
  ];
  styleHeader(goalsWs);
  goalsWs.getColumn(1).hidden = true;
  projects.forEach((project) => {
    project.goals.forEach(([milestone, date, progress, status]) => {
      goalsWs.addRow({ project: projectRef(project), milestone: tr(milestone), date: asDate(date), progress, status });
    });
  });
  goalsWs.getColumn(3).numFmt = 'yyyy-mm-dd';

  const ganttWs = wb.addWorksheet('Gantt');
  applyRtl(ganttWs);
  ganttWs.columns = [
    { header: 'Task ID', key: 'taskId', width: 10 },
    { header: 'Project', key: 'project', width: 34 },
    { header: 'Task Name', key: 'taskName', width: 50 },
    { header: 'Start Date', key: 'startDate', width: 15 },
    { header: 'Duration (Days)', key: 'duration', width: 16 },
    { header: 'Progress (%)', key: 'progress', width: 14 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Milestone', key: 'milestone', width: 12 },
    { header: 'Resource', key: 'resource', width: 24 },
    { header: 'PRED', key: 'pred', width: 18 },
  ];
  styleHeader(ganttWs);
  ganttWs.getColumn(2).hidden = true;
  projects.forEach((project) => {
    project.tasks.forEach(([taskId, taskName, startDate, duration, progress, status, milestone, resource, pred]) => {
      ganttWs.addRow({
        taskId,
        project: projectRef(project),
        taskName: tr(taskName),
        startDate: asDate(startDate),
        duration,
        progress,
        status,
        milestone,
        resource: tr(resource),
        pred,
      });
    });
  });
  ganttWs.getColumn(4).numFmt = 'yyyy-mm-dd';

  const resourcesWs = wb.addWorksheet('Resources');
  applyRtl(resourcesWs);
  resourcesWs.columns = [
    { header: 'Project', key: 'project', width: 34 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Role', key: 'role', width: 26 },
    { header: 'Color', key: 'color', width: 12 },
    { header: 'Capacity (%)', key: 'capacity', width: 14 },
  ];
  styleHeader(resourcesWs);
  resourcesWs.getColumn(1).hidden = true;
  projects.forEach((project) => {
    project.resources.forEach(([name, role, color, capacity]) => {
      resourcesWs.addRow({ project: projectRef(project), name: tr(name), role: tr(role), color, capacity });
    });
  });

  const rolesWs = wb.addWorksheet('Roles');
  applyRtl(rolesWs);
  rolesWs.columns = [
    { header: 'Project', key: 'project', width: 34 },
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Budget', key: 'budget', width: 15 },
    { header: 'Paid By', key: 'paidBy', width: 15 },
    { header: 'Currency', key: 'currency', width: 12 },
  ];
  styleHeader(rolesWs);
  rolesWs.getColumn(1).hidden = true;
  projects.forEach((project) => {
    project.roles.forEach(([name, budget, paidBy, currency]) => {
      rolesWs.addRow({ project: projectRef(project), name: tr(name), budget, paidBy, currency });
    });
  });

  await wb.xlsx.writeFile(outputPath);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
