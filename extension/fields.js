/* Field matching rules.
   Each profile key lists regexes tried against a field's accumulated context
   (label text, name, id, placeholder, aria-label, autocomplete). Order matters:
   the first key whose pattern matches wins, so more specific keys come first. */

const FIELD_RULES = [
  // Name — "first" before "name" so "First Name" never falls through to full name.
  ["first_name", [/\b(first[\s_-]*name|given[\s_-]*name|fname|forename)\b/i, /^first$/i]],
  ["last_name",  [/\b(last[\s_-]*name|family[\s_-]*name|surname|lname)\b/i, /^last$/i]],
  ["full_name",  [/\b(full[\s_-]*name|your[\s_-]*name|candidate[\s_-]*name)\b/i, /^name$/i]],

  ["email",      [/\b(e[\s_-]*mail|email[\s_-]*address)\b/i]],
  ["phone",      [/\b(phone|mobile|telephone|cell|contact[\s_-]*number)\b/i]],

  // Location — city/state/zip before the generic address line.
  ["city",       [/\b(city|town|locality)\b/i]],
  ["state",      [/\b(state|province|region|administrative)\b/i]],
  ["zip",        [/\b(zip|postal[\s_-]*code|postcode)\b/i]],
  ["country",    [/\b(country|nation)\b/i]],
  ["address",    [/\b(address|street|addr(ess)?[\s_-]*line[\s_-]*1)\b/i]],

  // Links — github/portfolio before the generic "website".
  ["linkedin",   [/\b(linked[\s_-]*in)\b/i]],
  ["github",     [/\b(git[\s_-]*hub)\b/i]],
  ["portfolio",  [/\b(portfolio|personal[\s_-]*(site|website)|website|home[\s_-]*page|url)\b/i]],

  // Education
  ["school",     [/\b(school|university|college|institution|alma[\s_-]*mater)\b/i]],
  ["degree",     [/\b(degree|education[\s_-]*level|qualification)\b/i]],
  ["major",      [/\b(major|discipline|field[\s_-]*of[\s_-]*study|concentration|course[\s_-]*of[\s_-]*study)\b/i]],
  ["gpa",        [/\b(gpa|grade[\s_-]*point)\b/i]],
  ["graduation_year",  [/\b(grad(uation)?[\s_-]*(year|date)|year[\s_-]*of[\s_-]*grad)/i, /\bend[\s_-]*year\b/i]],
  ["graduation_month", [/\b(grad(uation)?[\s_-]*month)\b/i, /\bend[\s_-]*month\b/i]],

  // Work authorization — "sponsor" checked before the general "authorized".
  ["requires_sponsorship", [/\b(sponsor(ship)?|visa[\s_-]*sponsor|require[\s_-]*sponsor|h-?1b)\b/i]],
  ["work_authorized",      [/\b(legally[\s_-]*authoriz|work[\s_-]*authoriz|authoriz(ed|ation)[\s_-]*to[\s_-]*work|eligible[\s_-]*to[\s_-]*work|right[\s_-]*to[\s_-]*work)\b/i]],

  // EEO
  ["gender",            [/\b(gender|sex)\b/i]],
  ["race",              [/\b(race|ethnic(ity)?|hispanic)\b/i]],
  ["veteran_status",    [/\b(veteran|military)\b/i]],
  ["disability_status", [/\b(disab(ility|led))\b/i]],

  ["start_date",      [/\b(start[\s_-]*date|available[\s_-]*(start|date)|earliest[\s_-]*start)\b/i]],
  ["how_did_you_hear", [/\b(how[\s_-]*did[\s_-]*you[\s_-]*hear|referral[\s_-]*source|source)\b/i]],
];

/* Fields never to touch, even if a rule would match. */
const NEVER_FILL = [
  /\b(password|passwd|pwd)\b/i,
  /\b(ssn|social[\s_-]*security|national[\s_-]*id|passport)\b/i,
  /\b(credit[\s_-]*card|card[\s_-]*number|cvv|cvc|routing|account[\s_-]*number|iban)\b/i,
  /\b(salary[\s_-]*expectation|desired[\s_-]*(salary|compensation)|compensation)\b/i,
  /\b(cover[\s_-]*letter|why[\s_-]*do[\s_-]*you|tell[\s_-]*us|describe|essay|question)\b/i,
  /\b(search|filter)\b/i,
];

/* Yes/no questions answered from a profile value that is itself yes/no. */
const BOOLEAN_KEYS = new Set(["work_authorized", "requires_sponsorship"]);

if (typeof module !== "undefined") {
  module.exports = { FIELD_RULES, NEVER_FILL, BOOLEAN_KEYS };
}
