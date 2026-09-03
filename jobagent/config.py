"""Target metros, role matching, and shared HTTP settings."""

# Each metro maps to the substrings that identify it in a raw location string.
# Keep these lowercase; matching is done on a lowercased location.
METROS = {
    "SF Bay Area": [
        "san francisco", "sf bay", "bay area", "palo alto", "mountain view",
        "menlo park", "sunnyvale", "santa clara", "san jose", "cupertino",
        "redwood city", "foster city", "san mateo", "berkeley", "oakland",
        "fremont", "milpitas", "burlingame", "emeryville", "belmont, ca",
        "los altos", "campbell, ca", "south san francisco", "brisbane, ca",
        "newark, ca", "alameda", "walnut creek", "pleasanton", "san carlos",
        "sausalito", "novato", "san ramon", "dublin, ca", "hayward",
    ],
    "NYC": [
        "new york", "nyc", "manhattan", "brooklyn", "queens, ny", "bronx",
        "long island city", "jersey city", "hoboken", "newark, nj",
        "white plains", "yonkers", "staten island",
    ],
    "Seattle": [
        "seattle", "bellevue", "redmond", "kirkland", "renton", "bothell",
        "tacoma", "everett", "sammamish", "issaquah", "tukwila", "kent, wa",
    ],
    "Austin": [
        "austin", "round rock", "cedar park", "georgetown, tx",
        "pflugerville", "san marcos, tx",
    ],
    "LA": [
        "los angeles", "santa monica", "culver city", "pasadena", "burbank",
        "el segundo", "long beach", "irvine", "playa vista", "venice, ca",
        "glendale, ca", "torrance", "manhattan beach", "hawthorne, ca",
        "west hollywood", "beverly hills", "marina del rey", "anaheim",
        "costa mesa", "newport beach", "sherman oaks", "inglewood",
    ],
}

# Words that make a title a software-engineering role.
SWE_TITLE_TERMS = [
    "software", "swe", "engineer", "engineering", "developer", "dev ",
    "programmer", "full stack", "fullstack", "full-stack", "backend",
    "back-end", "back end", "frontend", "front-end", "front end",
    "mobile", "ios", "android", "web develop", "platform", "infrastructure",
    "systems", "distributed", "compiler", "embedded", "devops", "sre",
    "site reliability", "machine learning", "ml engineer", "ai engineer",
    "computer vision", "nlp", "robotics software", "security engineer",
    "data engineer", "cloud", "api ", "sdk",
]

# Titles that contain a SWE term but are not SWE roles.
SWE_TITLE_EXCLUDE = [
    "sales engineer", "solutions engineer", "solution engineer",
    "customer engineer", "field engineer", "support engineer",
    "sales development", "recruit", "marketing", "financial",
    "civil engineer", "mechanical engineer", "chemical engineer",
    "industrial engineer", "environmental engineer", "structural engineer",
    "manufacturing engineer", "process engineer", "petroleum",
    "aerospace engineer", "electrical engineer", "hardware engineer",
    "biomedical", "engineer in training", "engineering manager",
    "engineering technician", "test technician", "quality engineer",
    "mechatronics", "optical engineer", "rf engineer", "materials engineer",
    "packaging engineer", "validation engineer", "controls engineer",
]

# Words that mark a posting as an internship.
INTERN_TERMS = ["intern", "internship", "co-op", "coop ", "summer analyst"]

# Titles that look like internships but are not the ones we want.
INTERN_EXCLUDE = [
    "intern manager", "internal ", "international ", "internship program manager",
]

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

BROWSER_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

REQUEST_TIMEOUT = 30
# Seconds between requests to the same host, so we stay a polite client.
RATE_LIMIT_DELAY = 1.5
# A source's cached results are reused if fresher than this (dashboard auto-refresh).
REFRESH_AFTER_HOURS = 6
