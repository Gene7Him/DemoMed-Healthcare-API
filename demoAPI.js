const API_KEY = "ak_6a41efb4800631da496e01cbc070c7e067cd4bc913b1b002";
const BASE_URL = "https://assessment.ksensetech.com/api";

const HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY
};

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 429 || res.status >= 500) {
        await delay(1000 * (i + 1));
        continue;
      }
      return await res.json();
    } catch {
      await delay(1000 * (i + 1));
    }
  }
  return null;
}

// Scoring Functions
function scoreBloodPressure(bp) {
  const match = bp?.match(/^(\d+)?\/(\d+)?$/);
  if (!match) return 0;
  const systolic = parseInt(match[1]);
  const diastolic = parseInt(match[2]);
  if (isNaN(systolic) || isNaN(diastolic)) return 0;

  if (systolic < 120 && diastolic < 80) return 1;
  if (120 <= systolic && systolic <= 129 && diastolic < 80) return 2;
  if ((130 <= systolic && systolic <= 139) || (80 <= diastolic && diastolic <= 89)) return 3;
  if (systolic >= 140 || diastolic >= 90) return 4;
  return 0;
}

function scoreTemperature(temp) {
  const value = parseFloat(temp);
  if (isNaN(value)) return 0;
  if (value <= 99.5) return 0;
  if (value <= 100.9) return 1;
  if (value >= 101.0) return 2;
  return 0;
}

function scoreAge(age) {
  const value = parseInt(age);
  if (isNaN(value)) return 0;
  if (value < 40) return 1;
  if (value <= 65) return 1;
  if (value > 65) return 2;
  return 0;
}

async function processPatients() {
  const highRisk = new Set();
  const fever = new Set();
  const dataIssues = new Set();

  for (let page = 1; page <= 10; page++) {
    const url = `${BASE_URL}/patients?page=${page}&limit=5`;
    const response = await fetchWithRetry(url);
    if (!response || !response.data) continue;

    for (const patient of response.data) {
      const pid = patient.patient_id;
      const bp = patient.blood_pressure;
      const temp = patient.temperature;
      const age = patient.age;

      const tempVal = parseFloat(temp);
      const ageVal = parseInt(age);
      const isBadBP = !/^(\d+)\/(\d+)$/.test(bp);
      const isBadTemp = isNaN(tempVal);
      const isBadAge = isNaN(ageVal);

      if (isBadBP || isBadTemp || isBadAge) {
        dataIssues.add(pid);
      }

      if (!isBadTemp && tempVal >= 99.6) {
        fever.add(pid);
      }

      const bpScore = scoreBloodPressure(bp);
      const tempScore = scoreTemperature(temp);
      const ageScore = scoreAge(age);
      const totalScore = bpScore + tempScore + ageScore;

      const allValid = !isBadBP && !isBadTemp && !isBadAge;
      if (allValid && totalScore >= 4) {
        highRisk.add(pid);
      }
    }
  }

  return {
    high_risk_patients: Array.from(highRisk).sort(),
    fever_patients: Array.from(fever).sort(),
    data_quality_issues: Array.from(dataIssues).sort()
  };
}

async function submitAssessment() {
  const results = await processPatients();

  console.log("Submitting:", results);

  const res = await fetch(`${BASE_URL}/submit-assessment`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(results)
  });

  const json = await res.json();
  console.log("Result:", JSON.stringify(json, null, 2));
}

submitAssessment();