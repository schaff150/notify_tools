const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const { sendEmailSMS } = require('../notifier');

function log(msg) {
    const ts = new Date().toISOString().replace('T',' ').substring(0,19);
    console.log(`[${ts}] [famguessr] ${msg}`);
}

// ─── Cities Database ──────────────────────────────────────────────────────────

const CITIES = [
    // ── North America ──
    {city:"New York",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Los Angeles",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Chicago",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Houston",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Phoenix",country:"United States",timezone:"America/Phoenix",emoji:"🇺🇸"},
    {city:"Philadelphia",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"San Antonio",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"San Diego",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Dallas",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"San Jose",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Austin",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Jacksonville",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Fort Worth",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Columbus",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Indianapolis",country:"United States",timezone:"America/Indiana/Indianapolis",emoji:"🇺🇸"},
    {city:"Charlotte",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"San Francisco",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Seattle",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Denver",country:"United States",timezone:"America/Denver",emoji:"🇺🇸"},
    {city:"Nashville",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Oklahoma City",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"El Paso",country:"United States",timezone:"America/Denver",emoji:"🇺🇸"},
    {city:"Washington DC",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Boston",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Las Vegas",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Portland",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Memphis",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Louisville",country:"United States",timezone:"America/Kentucky/Louisville",emoji:"🇺🇸"},
    {city:"Baltimore",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Milwaukee",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Albuquerque",country:"United States",timezone:"America/Denver",emoji:"🇺🇸"},
    {city:"Tucson",country:"United States",timezone:"America/Phoenix",emoji:"🇺🇸"},
    {city:"Fresno",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Sacramento",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Mesa",country:"United States",timezone:"America/Phoenix",emoji:"🇺🇸"},
    {city:"Atlanta",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Kansas City",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Colorado Springs",country:"United States",timezone:"America/Denver",emoji:"🇺🇸"},
    {city:"Omaha",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Raleigh",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Miami",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Long Beach",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Virginia Beach",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Oakland",country:"United States",timezone:"America/Los_Angeles",emoji:"🇺🇸"},
    {city:"Minneapolis",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Tampa",country:"United States",timezone:"America/New_York",emoji:"🇺🇸"},
    {city:"Tulsa",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Arlington",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"New Orleans",country:"United States",timezone:"America/Chicago",emoji:"🇺🇸"},
    {city:"Anchorage",country:"United States",timezone:"America/Anchorage",emoji:"🇺🇸"},
    {city:"Honolulu",country:"United States",timezone:"Pacific/Honolulu",emoji:"🇺🇸"},
    {city:"Toronto",country:"Canada",timezone:"America/Toronto",emoji:"🇨🇦"},
    {city:"Vancouver",country:"Canada",timezone:"America/Vancouver",emoji:"🇨🇦"},
    {city:"Montreal",country:"Canada",timezone:"America/Montreal",emoji:"🇨🇦"},
    {city:"Calgary",country:"Canada",timezone:"America/Edmonton",emoji:"🇨🇦"},
    {city:"Edmonton",country:"Canada",timezone:"America/Edmonton",emoji:"🇨🇦"},
    {city:"Ottawa",country:"Canada",timezone:"America/Toronto",emoji:"🇨🇦"},
    {city:"Winnipeg",country:"Canada",timezone:"America/Winnipeg",emoji:"🇨🇦"},
    {city:"Quebec City",country:"Canada",timezone:"America/Toronto",emoji:"🇨🇦"},
    {city:"Halifax",country:"Canada",timezone:"America/Halifax",emoji:"🇨🇦"},
    {city:"St. John's",country:"Canada",timezone:"America/St_Johns",emoji:"🇨🇦"},
    {city:"Mexico City",country:"Mexico",timezone:"America/Mexico_City",emoji:"🇲🇽"},
    {city:"Guadalajara",country:"Mexico",timezone:"America/Mexico_City",emoji:"🇲🇽"},
    {city:"Monterrey",country:"Mexico",timezone:"America/Monterrey",emoji:"🇲🇽"},
    {city:"Cancún",country:"Mexico",timezone:"America/Cancun",emoji:"🇲🇽"},
    {city:"Tijuana",country:"Mexico",timezone:"America/Tijuana",emoji:"🇲🇽"},

    // ── Central America & Caribbean ──
    {city:"Havana",country:"Cuba",timezone:"America/Havana",emoji:"🇨🇺"},
    {city:"Kingston",country:"Jamaica",timezone:"America/Jamaica",emoji:"🇯🇲"},
    {city:"Nassau",country:"Bahamas",timezone:"America/Nassau",emoji:"🇧🇸"},
    {city:"Port-au-Prince",country:"Haiti",timezone:"America/Port-au-Prince",emoji:"🇭🇹"},
    {city:"Santo Domingo",country:"Dominican Republic",timezone:"America/Santo_Domingo",emoji:"🇩🇴"},
    {city:"San Juan",country:"Puerto Rico",timezone:"America/Puerto_Rico",emoji:"🇵🇷"},
    {city:"Panama City",country:"Panama",timezone:"America/Panama",emoji:"🇵🇦"},
    {city:"San José",country:"Costa Rica",timezone:"America/Costa_Rica",emoji:"🇨🇷"},
    {city:"Guatemala City",country:"Guatemala",timezone:"America/Guatemala",emoji:"🇬🇹"},
    {city:"Managua",country:"Nicaragua",timezone:"America/Managua",emoji:"🇳🇮"},
    {city:"Tegucigalpa",country:"Honduras",timezone:"America/Tegucigalpa",emoji:"🇭🇳"},
    {city:"San Salvador",country:"El Salvador",timezone:"America/El_Salvador",emoji:"🇸🇻"},
    {city:"Belmopan",country:"Belize",timezone:"America/Belize",emoji:"🇧🇿"},

    // ── South America ──
    {city:"São Paulo",country:"Brazil",timezone:"America/Sao_Paulo",emoji:"🇧🇷"},
    {city:"Rio de Janeiro",country:"Brazil",timezone:"America/Sao_Paulo",emoji:"🇧🇷"},
    {city:"Brasília",country:"Brazil",timezone:"America/Sao_Paulo",emoji:"🇧🇷"},
    {city:"Salvador",country:"Brazil",timezone:"America/Bahia",emoji:"🇧🇷"},
    {city:"Fortaleza",country:"Brazil",timezone:"America/Fortaleza",emoji:"🇧🇷"},
    {city:"Belo Horizonte",country:"Brazil",timezone:"America/Sao_Paulo",emoji:"🇧🇷"},
    {city:"Manaus",country:"Brazil",timezone:"America/Manaus",emoji:"🇧🇷"},
    {city:"Curitiba",country:"Brazil",timezone:"America/Sao_Paulo",emoji:"🇧🇷"},
    {city:"Recife",country:"Brazil",timezone:"America/Recife",emoji:"🇧🇷"},
    {city:"Porto Alegre",country:"Brazil",timezone:"America/Sao_Paulo",emoji:"🇧🇷"},
    {city:"Florianópolis",country:"Brazil",timezone:"America/Sao_Paulo",emoji:"🇧🇷"},
    {city:"Natal",country:"Brazil",timezone:"America/Fortaleza",emoji:"🇧🇷"},
    {city:"Buenos Aires",country:"Argentina",timezone:"America/Argentina/Buenos_Aires",emoji:"🇦🇷"},
    {city:"Córdoba",country:"Argentina",timezone:"America/Argentina/Cordoba",emoji:"🇦🇷"},
    {city:"Rosario",country:"Argentina",timezone:"America/Argentina/Cordoba",emoji:"🇦🇷"},
    {city:"Mendoza",country:"Argentina",timezone:"America/Argentina/Mendoza",emoji:"🇦🇷"},
    {city:"Ushuaia",country:"Argentina",timezone:"America/Argentina/Ushuaia",emoji:"🇦🇷"},
    {city:"Mar del Plata",country:"Argentina",timezone:"America/Argentina/Buenos_Aires",emoji:"🇦🇷"},
    {city:"Santiago",country:"Chile",timezone:"America/Santiago",emoji:"🇨🇱"},
    {city:"Concepción",country:"Chile",timezone:"America/Santiago",emoji:"🇨🇱"},
    {city:"Punta Arenas",country:"Chile",timezone:"America/Punta_Arenas",emoji:"🇨🇱"},
    {city:"Easter Island",country:"Chile",timezone:"Pacific/Easter",emoji:"🇨🇱"},
    {city:"Bogotá",country:"Colombia",timezone:"America/Bogota",emoji:"🇨🇴"},
    {city:"Medellín",country:"Colombia",timezone:"America/Bogota",emoji:"🇨🇴"},
    {city:"Cali",country:"Colombia",timezone:"America/Bogota",emoji:"🇨🇴"},
    {city:"Cartagena",country:"Colombia",timezone:"America/Bogota",emoji:"🇨🇴"},
    {city:"Barranquilla",country:"Colombia",timezone:"America/Bogota",emoji:"🇨🇴"},
    {city:"Lima",country:"Peru",timezone:"America/Lima",emoji:"🇵🇪"},
    {city:"Cusco",country:"Peru",timezone:"America/Lima",emoji:"🇵🇪"},
    {city:"Arequipa",country:"Peru",timezone:"America/Lima",emoji:"🇵🇪"},
    {city:"Caracas",country:"Venezuela",timezone:"America/Caracas",emoji:"🇻🇪"},
    {city:"Maracaibo",country:"Venezuela",timezone:"America/Caracas",emoji:"🇻🇪"},
    {city:"Quito",country:"Ecuador",timezone:"America/Guayaquil",emoji:"🇪🇨"},
    {city:"Guayaquil",country:"Ecuador",timezone:"America/Guayaquil",emoji:"🇪🇨"},
    {city:"Galápagos Islands",country:"Ecuador",timezone:"Pacific/Galapagos",emoji:"🇪🇨"},
    {city:"La Paz",country:"Bolivia",timezone:"America/La_Paz",emoji:"🇧🇴"},
    {city:"Sucre",country:"Bolivia",timezone:"America/La_Paz",emoji:"🇧🇴"},
    {city:"Santa Cruz",country:"Bolivia",timezone:"America/La_Paz",emoji:"🇧🇴"},
    {city:"Asunción",country:"Paraguay",timezone:"America/Asuncion",emoji:"🇵🇾"},
    {city:"Montevideo",country:"Uruguay",timezone:"America/Montevideo",emoji:"🇺🇾"},
    {city:"Georgetown",country:"Guyana",timezone:"America/Guyana",emoji:"🇬🇾"},
    {city:"Cayenne",country:"French Guiana",timezone:"America/Cayenne",emoji:"🇬🇫"},

    // ── Europe ──
    {city:"London",country:"United Kingdom",timezone:"Europe/London",emoji:"🇬🇧"},
    {city:"Manchester",country:"United Kingdom",timezone:"Europe/London",emoji:"🇬🇧"},
    {city:"Birmingham",country:"United Kingdom",timezone:"Europe/London",emoji:"🇬🇧"},
    {city:"Edinburgh",country:"United Kingdom",timezone:"Europe/London",emoji:"🇬🇧"},
    {city:"Glasgow",country:"United Kingdom",timezone:"Europe/London",emoji:"🇬🇧"},
    {city:"Cardiff",country:"United Kingdom",timezone:"Europe/London",emoji:"🇬🇧"},
    {city:"Belfast",country:"United Kingdom",timezone:"Europe/London",emoji:"🇬🇧"},
    {city:"Dublin",country:"Ireland",timezone:"Europe/Dublin",emoji:"🇮🇪"},
    {city:"Cork",country:"Ireland",timezone:"Europe/Dublin",emoji:"🇮🇪"},
    {city:"Paris",country:"France",timezone:"Europe/Paris",emoji:"🇫🇷"},
    {city:"Marseille",country:"France",timezone:"Europe/Paris",emoji:"🇫🇷"},
    {city:"Lyon",country:"France",timezone:"Europe/Paris",emoji:"🇫🇷"},
    {city:"Nice",country:"France",timezone:"Europe/Paris",emoji:"🇫🇷"},
    {city:"Toulouse",country:"France",timezone:"Europe/Paris",emoji:"🇫🇷"},
    {city:"Bordeaux",country:"France",timezone:"Europe/Paris",emoji:"🇫🇷"},
    {city:"Strasbourg",country:"France",timezone:"Europe/Paris",emoji:"🇫🇷"},
    {city:"Berlin",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Munich",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Hamburg",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Cologne",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Frankfurt",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Stuttgart",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Düsseldorf",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Leipzig",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Dortmund",country:"Germany",timezone:"Europe/Berlin",emoji:"🇩🇪"},
    {city:"Rome",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Milan",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Naples",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Venice",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Florence",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Bologna",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Turin",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Palermo",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Genoa",country:"Italy",timezone:"Europe/Rome",emoji:"🇮🇹"},
    {city:"Madrid",country:"Spain",timezone:"Europe/Madrid",emoji:"🇪🇸"},
    {city:"Barcelona",country:"Spain",timezone:"Europe/Madrid",emoji:"🇪🇸"},
    {city:"Valencia",country:"Spain",timezone:"Europe/Madrid",emoji:"🇪🇸"},
    {city:"Seville",country:"Spain",timezone:"Europe/Madrid",emoji:"🇪🇸"},
    {city:"Bilbao",country:"Spain",timezone:"Europe/Madrid",emoji:"🇪🇸"},
    {city:"Málaga",country:"Spain",timezone:"Europe/Madrid",emoji:"🇪🇸"},
    {city:"Granada",country:"Spain",timezone:"Europe/Madrid",emoji:"🇪🇸"},
    {city:"Canary Islands",country:"Spain",timezone:"Atlantic/Canary",emoji:"🇪🇸"},
    {city:"Amsterdam",country:"Netherlands",timezone:"Europe/Amsterdam",emoji:"🇳🇱"},
    {city:"Rotterdam",country:"Netherlands",timezone:"Europe/Amsterdam",emoji:"🇳🇱"},
    {city:"Utrecht",country:"Netherlands",timezone:"Europe/Amsterdam",emoji:"🇳🇱"},
    {city:"The Hague",country:"Netherlands",timezone:"Europe/Amsterdam",emoji:"🇳🇱"},
    {city:"Brussels",country:"Belgium",timezone:"Europe/Brussels",emoji:"🇧🇪"},
    {city:"Antwerp",country:"Belgium",timezone:"Europe/Brussels",emoji:"🇧🇪"},
    {city:"Ghent",country:"Belgium",timezone:"Europe/Brussels",emoji:"🇧🇪"},
    {city:"Vienna",country:"Austria",timezone:"Europe/Vienna",emoji:"🇦🇹"},
    {city:"Salzburg",country:"Austria",timezone:"Europe/Vienna",emoji:"🇦🇹"},
    {city:"Graz",country:"Austria",timezone:"Europe/Vienna",emoji:"🇦🇹"},
    {city:"Zurich",country:"Switzerland",timezone:"Europe/Zurich",emoji:"🇨🇭"},
    {city:"Geneva",country:"Switzerland",timezone:"Europe/Zurich",emoji:"🇨🇭"},
    {city:"Basel",country:"Switzerland",timezone:"Europe/Zurich",emoji:"🇨🇭"},
    {city:"Stockholm",country:"Sweden",timezone:"Europe/Stockholm",emoji:"🇸🇪"},
    {city:"Gothenburg",country:"Sweden",timezone:"Europe/Stockholm",emoji:"🇸🇪"},
    {city:"Malmö",country:"Sweden",timezone:"Europe/Stockholm",emoji:"🇸🇪"},
    {city:"Oslo",country:"Norway",timezone:"Europe/Oslo",emoji:"🇳🇴"},
    {city:"Bergen",country:"Norway",timezone:"Europe/Oslo",emoji:"🇳🇴"},
    {city:"Copenhagen",country:"Denmark",timezone:"Europe/Copenhagen",emoji:"🇩🇰"},
    {city:"Aarhus",country:"Denmark",timezone:"Europe/Copenhagen",emoji:"🇩🇰"},
    {city:"Helsinki",country:"Finland",timezone:"Europe/Helsinki",emoji:"🇫🇮"},
    {city:"Tampere",country:"Finland",timezone:"Europe/Helsinki",emoji:"🇫🇮"},
    {city:"Reykjavik",country:"Iceland",timezone:"Atlantic/Reykjavik",emoji:"🇮🇸"},
    {city:"Warsaw",country:"Poland",timezone:"Europe/Warsaw",emoji:"🇵🇱"},
    {city:"Kraków",country:"Poland",timezone:"Europe/Warsaw",emoji:"🇵🇱"},
    {city:"Szczecin",country:"Poland",timezone:"Europe/Warsaw",emoji:"🇵🇱"},
    {city:"Gdańsk",country:"Poland",timezone:"Europe/Warsaw",emoji:"🇵🇱"},
    {city:"Wrocław",country:"Poland",timezone:"Europe/Warsaw",emoji:"🇵🇱"},
    {city:"Prague",country:"Czech Republic",timezone:"Europe/Prague",emoji:"🇨🇿"},
    {city:"Brno",country:"Czech Republic",timezone:"Europe/Prague",emoji:"🇨🇿"},
    {city:"Budapest",country:"Hungary",timezone:"Europe/Budapest",emoji:"🇭🇺"},
    {city:"Debrecen",country:"Hungary",timezone:"Europe/Budapest",emoji:"🇭🇺"},
    {city:"Lisbon",country:"Portugal",timezone:"Europe/Lisbon",emoji:"🇵🇹"},
    {city:"Porto",country:"Portugal",timezone:"Europe/Lisbon",emoji:"🇵🇹"},
    {city:"Azores",country:"Portugal",timezone:"Atlantic/Azores",emoji:"🇵🇹"},
    {city:"Athens",country:"Greece",timezone:"Europe/Athens",emoji:"🇬🇷"},
    {city:"Thessaloniki",country:"Greece",timezone:"Europe/Athens",emoji:"🇬🇷"},
    {city:"Istanbul",country:"Turkey",timezone:"Europe/Istanbul",emoji:"🇹🇷"},
    {city:"Ankara",country:"Turkey",timezone:"Europe/Istanbul",emoji:"🇹🇷"},
    {city:"Bucharest",country:"Romania",timezone:"Europe/Bucharest",emoji:"🇷🇴"},
    {city:"Cluj-Napoca",country:"Romania",timezone:"Europe/Bucharest",emoji:"🇷🇴"},
    {city:"Timișoara",country:"Romania",timezone:"Europe/Bucharest",emoji:"🇷🇴"},
    {city:"Sofia",country:"Bulgaria",timezone:"Europe/Sofia",emoji:"🇧🇬"},
    {city:"Varna",country:"Bulgaria",timezone:"Europe/Sofia",emoji:"🇧🇬"},
    {city:"Belgrade",country:"Serbia",timezone:"Europe/Belgrade",emoji:"🇷🇸"},
    {city:"Novi Sad",country:"Serbia",timezone:"Europe/Belgrade",emoji:"🇷🇸"},
    {city:"Zagreb",country:"Croatia",timezone:"Europe/Zagreb",emoji:"🇭🇷"},
    {city:"Split",country:"Croatia",timezone:"Europe/Zagreb",emoji:"🇭🇷"},
    {city:"Kyiv",country:"Ukraine",timezone:"Europe/Kyiv",emoji:"🇺🇦"},
    {city:"Odessa",country:"Ukraine",timezone:"Europe/Kyiv",emoji:"🇺🇦"},
    {city:"Lviv",country:"Ukraine",timezone:"Europe/Kyiv",emoji:"🇺🇦"},
    {city:"Kharkiv",country:"Ukraine",timezone:"Europe/Kyiv",emoji:"🇺🇦"},
    {city:"Moscow",country:"Russia",timezone:"Europe/Moscow",emoji:"🇷🇺"},
    {city:"Saint Petersburg",country:"Russia",timezone:"Europe/Moscow",emoji:"🇷🇺"},
    {city:"Kazan",country:"Russia",timezone:"Europe/Moscow",emoji:"🇷🇺"},
    {city:"Nizhny Novgorod",country:"Russia",timezone:"Europe/Moscow",emoji:"🇷🇺"},
    {city:"Samara",country:"Russia",timezone:"Europe/Samara",emoji:"🇷🇺"},
    {city:"Kaliningrad",country:"Russia",timezone:"Europe/Kaliningrad",emoji:"🇷🇺"},
    {city:"Volgograd",country:"Russia",timezone:"Europe/Volgograd",emoji:"🇷🇺"},
    {city:"Sochi",country:"Russia",timezone:"Europe/Moscow",emoji:"🇷🇺"},
    {city:"Murmansk",country:"Russia",timezone:"Europe/Moscow",emoji:"🇷🇺"},
    {city:"Minsk",country:"Belarus",timezone:"Europe/Minsk",emoji:"🇧🇾"},
    {city:"Chisinau",country:"Moldova",timezone:"Europe/Chisinau",emoji:"🇲🇩"},
    {city:"Vilnius",country:"Lithuania",timezone:"Europe/Vilnius",emoji:"🇱🇹"},
    {city:"Klaipėda",country:"Lithuania",timezone:"Europe/Vilnius",emoji:"🇱🇹"},
    {city:"Riga",country:"Latvia",timezone:"Europe/Riga",emoji:"🇱🇻"},
    {city:"Tallinn",country:"Estonia",timezone:"Europe/Tallinn",emoji:"🇪🇪"},
    {city:"Sarajevo",country:"Bosnia",timezone:"Europe/Sarajevo",emoji:"🇧🇦"},
    {city:"Ljubljana",country:"Slovenia",timezone:"Europe/Ljubljana",emoji:"🇸🇮"},
    {city:"Bratislava",country:"Slovakia",timezone:"Europe/Bratislava",emoji:"🇸🇰"},
    {city:"Košice",country:"Slovakia",timezone:"Europe/Bratislava",emoji:"🇸🇰"},
    {city:"Tirana",country:"Albania",timezone:"Europe/Tirane",emoji:"🇦🇱"},
    {city:"Skopje",country:"North Macedonia",timezone:"Europe/Skopje",emoji:"🇲🇰"},
    {city:"Podgorica",country:"Montenegro",timezone:"Europe/Podgorica",emoji:"🇲🇪"},
    {city:"Valletta",country:"Malta",timezone:"Europe/Malta",emoji:"🇲🇹"},
    {city:"Nicosia",country:"Cyprus",timezone:"Asia/Nicosia",emoji:"🇨🇾"},
    {city:"Luxembourg City",country:"Luxembourg",timezone:"Europe/Luxembourg",emoji:"🇱🇺"},
    {city:"Monaco",country:"Monaco",timezone:"Europe/Monaco",emoji:"🇲🇨"},
    {city:"Andorra la Vella",country:"Andorra",timezone:"Europe/Andorra",emoji:"🇦🇩"},
    {city:"Vatican City",country:"Vatican City",timezone:"Europe/Vatican",emoji:"🇻🇦"},
    {city:"San Marino",country:"San Marino",timezone:"Europe/San_Marino",emoji:"🇸🇲"},
    {city:"Gibraltar",country:"Gibraltar",timezone:"Europe/Gibraltar",emoji:"🇬🇮"},
    {city:"Tórshavn",country:"Faroe Islands",timezone:"Atlantic/Faroe",emoji:"🇫🇴"},
    {city:"Douglas",country:"Isle of Man",timezone:"Europe/Isle_of_Man",emoji:"🇮🇲"},
    {city:"Saint Helier",country:"Jersey",timezone:"Europe/Jersey",emoji:"🇯🇪"},
    {city:"Saint Peter Port",country:"Guernsey",timezone:"Europe/Guernsey",emoji:"🇬🇬"},

    // ── Africa ──
    {city:"Cairo",country:"Egypt",timezone:"Africa/Cairo",emoji:"🇪🇬"},
    {city:"Alexandria",country:"Egypt",timezone:"Africa/Cairo",emoji:"🇪🇬"},
    {city:"Suez",country:"Egypt",timezone:"Africa/Cairo",emoji:"🇪🇬"},
    {city:"Luxor",country:"Egypt",timezone:"Africa/Cairo",emoji:"🇪🇬"},
    {city:"Lagos",country:"Nigeria",timezone:"Africa/Lagos",emoji:"🇳🇬"},
    {city:"Abuja",country:"Nigeria",timezone:"Africa/Lagos",emoji:"🇳🇬"},
    {city:"Kano",country:"Nigeria",timezone:"Africa/Lagos",emoji:"🇳🇬"},
    {city:"Ibadan",country:"Nigeria",timezone:"Africa/Lagos",emoji:"🇳🇬"},
    {city:"Port Harcourt",country:"Nigeria",timezone:"Africa/Lagos",emoji:"🇳🇬"},
    {city:"Nairobi",country:"Kenya",timezone:"Africa/Nairobi",emoji:"🇰🇪"},
    {city:"Mombasa",country:"Kenya",timezone:"Africa/Nairobi",emoji:"🇰🇪"},
    {city:"Kisumu",country:"Kenya",timezone:"Africa/Nairobi",emoji:"🇰🇪"},
    {city:"Johannesburg",country:"South Africa",timezone:"Africa/Johannesburg",emoji:"🇿🇦"},
    {city:"Cape Town",country:"South Africa",timezone:"Africa/Johannesburg",emoji:"🇿🇦"},
    {city:"Durban",country:"South Africa",timezone:"Africa/Johannesburg",emoji:"🇿🇦"},
    {city:"Pretoria",country:"South Africa",timezone:"Africa/Johannesburg",emoji:"🇿🇦"},
    {city:"Port Elizabeth",country:"South Africa",timezone:"Africa/Johannesburg",emoji:"🇿🇦"},
    {city:"Bloemfontein",country:"South Africa",timezone:"Africa/Johannesburg",emoji:"🇿🇦"},
    {city:"Addis Ababa",country:"Ethiopia",timezone:"Africa/Addis_Ababa",emoji:"🇪🇹"},
    {city:"Dar es Salaam",country:"Tanzania",timezone:"Africa/Dar_es_Salaam",emoji:"🇹🇿"},
    {city:"Arusha",country:"Tanzania",timezone:"Africa/Dar_es_Salaam",emoji:"🇹🇿"},
    {city:"Zanzibar City",country:"Tanzania",timezone:"Africa/Dar_es_Salaam",emoji:"🇹🇿"},
    {city:"Khartoum",country:"Sudan",timezone:"Africa/Khartoum",emoji:"🇸🇩"},
    {city:"Algiers",country:"Algeria",timezone:"Africa/Algiers",emoji:"🇩🇿"},
    {city:"Oran",country:"Algeria",timezone:"Africa/Algiers",emoji:"🇩🇿"},
    {city:"Constantine",country:"Algeria",timezone:"Africa/Algiers",emoji:"🇩🇿"},
    {city:"Casablanca",country:"Morocco",timezone:"Africa/Casablanca",emoji:"🇲🇦"},
    {city:"Marrakech",country:"Morocco",timezone:"Africa/Casablanca",emoji:"🇲🇦"},
    {city:"Rabat",country:"Morocco",timezone:"Africa/Casablanca",emoji:"🇲🇦"},
    {city:"Fez",country:"Morocco",timezone:"Africa/Casablanca",emoji:"🇲🇦"},
    {city:"Tangier",country:"Morocco",timezone:"Africa/Casablanca",emoji:"🇲🇦"},
    {city:"Accra",country:"Ghana",timezone:"Africa/Accra",emoji:"🇬🇭"},
    {city:"Kumasi",country:"Ghana",timezone:"Africa/Accra",emoji:"🇬🇭"},
    {city:"Kampala",country:"Uganda",timezone:"Africa/Kampala",emoji:"🇺🇬"},
    {city:"Luanda",country:"Angola",timezone:"Africa/Luanda",emoji:"🇦🇴"},
    {city:"Tunis",country:"Tunisia",timezone:"Africa/Tunis",emoji:"🇹🇳"},
    {city:"Dakar",country:"Senegal",timezone:"Africa/Dakar",emoji:"🇸🇳"},
    {city:"Tripoli",country:"Libya",timezone:"Africa/Tripoli",emoji:"🇱🇾"},
    {city:"Kigali",country:"Rwanda",timezone:"Africa/Kigali",emoji:"🇷🇼"},
    {city:"Maputo",country:"Mozambique",timezone:"Africa/Maputo",emoji:"🇲🇿"},
    {city:"Harare",country:"Zimbabwe",timezone:"Africa/Harare",emoji:"🇿🇼"},
    {city:"Lusaka",country:"Zambia",timezone:"Africa/Lusaka",emoji:"🇿🇲"},
    {city:"Windhoek",country:"Namibia",timezone:"Africa/Windhoek",emoji:"🇳🇦"},
    {city:"Gaborone",country:"Botswana",timezone:"Africa/Gaborone",emoji:"🇧🇼"},
    {city:"Antananarivo",country:"Madagascar",timezone:"Indian/Antananarivo",emoji:"🇲🇬"},
    {city:"Port Louis",country:"Mauritius",timezone:"Indian/Mauritius",emoji:"🇲🇺"},
    {city:"Victoria",country:"Seychelles",timezone:"Indian/Mahe",emoji:"🇸🇨"},
    {city:"Bamako",country:"Mali",timezone:"Africa/Bamako",emoji:"🇲🇱"},
    {city:"Ouagadougou",country:"Burkina Faso",timezone:"Africa/Ouagadougou",emoji:"🇧🇫"},
    {city:"Niamey",country:"Niger",timezone:"Africa/Niamey",emoji:"🇳🇪"},
    {city:"N'Djamena",country:"Chad",timezone:"Africa/Ndjamena",emoji:"🇹🇩"},
    {city:"Mogadishu",country:"Somalia",timezone:"Africa/Mogadishu",emoji:"🇸🇴"},
    {city:"Conakry",country:"Guinea",timezone:"Africa/Conakry",emoji:"🇬🇳"},
    {city:"Freetown",country:"Sierra Leone",timezone:"Africa/Freetown",emoji:"🇸🇱"},
    {city:"Monrovia",country:"Liberia",timezone:"Africa/Monrovia",emoji:"🇱🇷"},
    {city:"Abidjan",country:"Ivory Coast",timezone:"Africa/Abidjan",emoji:"🇨🇮"},
    {city:"Lomé",country:"Togo",timezone:"Africa/Lome",emoji:"🇹🇬"},
    {city:"Cotonou",country:"Benin",timezone:"Africa/Porto-Novo",emoji:"🇧🇯"},
    {city:"Yaoundé",country:"Cameroon",timezone:"Africa/Douala",emoji:"🇨🇲"},
    {city:"Libreville",country:"Gabon",timezone:"Africa/Libreville",emoji:"🇬🇦"},
    {city:"Brazzaville",country:"Congo",timezone:"Africa/Brazzaville",emoji:"🇨🇬"},
    {city:"Kinshasa",country:"DR Congo",timezone:"Africa/Kinshasa",emoji:"🇨🇩"},
    {city:"Praia",country:"Cape Verde",timezone:"Atlantic/Cape_Verde",emoji:"🇨🇻"},
    {city:"São Tomé",country:"São Tomé and Príncipe",timezone:"Africa/Sao_Tome",emoji:"🇸🇹"},
    {city:"Malabo",country:"Equatorial Guinea",timezone:"Africa/Malabo",emoji:"🇬🇶"},
    {city:"Banjul",country:"Gambia",timezone:"Africa/Banjul",emoji:"🇬🇲"},
    {city:"Bissau",country:"Guinea-Bissau",timezone:"Africa/Bissau",emoji:"🇬🇼"},
    {city:"Djibouti City",country:"Djibouti",timezone:"Africa/Djibouti",emoji:"🇩🇯"},
    {city:"Asmara",country:"Eritrea",timezone:"Africa/Asmara",emoji:"🇪🇷"},
    {city:"Juba",country:"South Sudan",timezone:"Africa/Juba",emoji:"🇸🇸"},
    {city:"Gitega",country:"Burundi",timezone:"Africa/Bujumbura",emoji:"🇧🇮"},
    {city:"Lilongwe",country:"Malawi",timezone:"Africa/Blantyre",emoji:"🇲🇼"},
    {city:"Mbabane",country:"Eswatini",timezone:"Africa/Mbabane",emoji:"🇸🇿"},
    {city:"Maseru",country:"Lesotho",timezone:"Africa/Maseru",emoji:"🇱🇸"},
    {city:"Moroni",country:"Comoros",timezone:"Indian/Comoro",emoji:"🇰🇲"},
    {city:"Saint-Denis",country:"Réunion",timezone:"Indian/Reunion",emoji:"🇷🇪"},

    // ── Middle East ──
    {city:"Dubai",country:"United Arab Emirates",timezone:"Asia/Dubai",emoji:"🇦🇪"},
    {city:"Abu Dhabi",country:"United Arab Emirates",timezone:"Asia/Dubai",emoji:"🇦🇪"},
    {city:"Riyadh",country:"Saudi Arabia",timezone:"Asia/Riyadh",emoji:"🇸🇦"},
    {city:"Jeddah",country:"Saudi Arabia",timezone:"Asia/Riyadh",emoji:"🇸🇦"},
    {city:"Mecca",country:"Saudi Arabia",timezone:"Asia/Riyadh",emoji:"🇸🇦"},
    {city:"Doha",country:"Qatar",timezone:"Asia/Qatar",emoji:"🇶🇦"},
    {city:"Kuwait City",country:"Kuwait",timezone:"Asia/Kuwait",emoji:"🇰🇼"},
    {city:"Manama",country:"Bahrain",timezone:"Asia/Bahrain",emoji:"🇧🇭"},
    {city:"Muscat",country:"Oman",timezone:"Asia/Muscat",emoji:"🇴🇲"},
    {city:"Amman",country:"Jordan",timezone:"Asia/Amman",emoji:"🇯🇴"},
    {city:"Beirut",country:"Lebanon",timezone:"Asia/Beirut",emoji:"🇱🇧"},
    {city:"Damascus",country:"Syria",timezone:"Asia/Damascus",emoji:"🇸🇾"},
    {city:"Baghdad",country:"Iraq",timezone:"Asia/Baghdad",emoji:"🇮🇶"},
    {city:"Tehran",country:"Iran",timezone:"Asia/Tehran",emoji:"🇮🇷"},
    {city:"Jerusalem",country:"Israel",timezone:"Asia/Jerusalem",emoji:"🇮🇱"},
    {city:"Tel Aviv",country:"Israel",timezone:"Asia/Jerusalem",emoji:"🇮🇱"},
    {city:"Sana'a",country:"Yemen",timezone:"Asia/Aden",emoji:"🇾🇪"},

    // ── Central Asia ──
    {city:"Tashkent",country:"Uzbekistan",timezone:"Asia/Tashkent",emoji:"🇺🇿"},
    {city:"Almaty",country:"Kazakhstan",timezone:"Asia/Almaty",emoji:"🇰🇿"},
    {city:"Astana",country:"Kazakhstan",timezone:"Asia/Almaty",emoji:"🇰🇿"},
    {city:"Bishkek",country:"Kyrgyzstan",timezone:"Asia/Bishkek",emoji:"🇰🇬"},
    {city:"Dushanbe",country:"Tajikistan",timezone:"Asia/Dushanbe",emoji:"🇹🇯"},
    {city:"Ashgabat",country:"Turkmenistan",timezone:"Asia/Ashgabat",emoji:"🇹🇲"},
    {city:"Baku",country:"Azerbaijan",timezone:"Asia/Baku",emoji:"🇦🇿"},
    {city:"Tbilisi",country:"Georgia",timezone:"Asia/Tbilisi",emoji:"🇬🇪"},
    {city:"Yerevan",country:"Armenia",timezone:"Asia/Yerevan",emoji:"🇦🇲"},

    // ── South Asia ──
    {city:"Mumbai",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Delhi",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Bangalore",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Hyderabad",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Chennai",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Kolkata",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Ahmedabad",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Pune",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Jaipur",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Lucknow",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Surat",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Nagpur",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Indore",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Coimbatore",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Visakhapatnam",country:"India",timezone:"Asia/Kolkata",emoji:"🇮🇳"},
    {city:"Karachi",country:"Pakistan",timezone:"Asia/Karachi",emoji:"🇵🇰"},
    {city:"Lahore",country:"Pakistan",timezone:"Asia/Karachi",emoji:"🇵🇰"},
    {city:"Islamabad",country:"Pakistan",timezone:"Asia/Karachi",emoji:"🇵🇰"},
    {city:"Peshawar",country:"Pakistan",timezone:"Asia/Karachi",emoji:"🇵🇰"},
    {city:"Multan",country:"Pakistan",timezone:"Asia/Karachi",emoji:"🇵🇰"},
    {city:"Dhaka",country:"Bangladesh",timezone:"Asia/Dhaka",emoji:"🇧🇩"},
    {city:"Colombo",country:"Sri Lanka",timezone:"Asia/Colombo",emoji:"🇱🇰"},
    {city:"Kandy",country:"Sri Lanka",timezone:"Asia/Colombo",emoji:"🇱🇰"},
    {city:"Kathmandu",country:"Nepal",timezone:"Asia/Kathmandu",emoji:"🇳🇵"},
    {city:"Pokhara",country:"Nepal",timezone:"Asia/Kathmandu",emoji:"🇳🇵"},
    {city:"Malé",country:"Maldives",timezone:"Indian/Maldives",emoji:"🇲🇻"},
    {city:"Thimphu",country:"Bhutan",timezone:"Asia/Thimphu",emoji:"🇧🇹"},

    // ── East Asia ──
    {city:"Tokyo",country:"Japan",timezone:"Asia/Tokyo",emoji:"🇯🇵"},
    {city:"Osaka",country:"Japan",timezone:"Asia/Tokyo",emoji:"🇯🇵"},
    {city:"Kyoto",country:"Japan",timezone:"Asia/Tokyo",emoji:"🇯🇵"},
    {city:"Sapporo",country:"Japan",timezone:"Asia/Tokyo",emoji:"🇯🇵"},
    {city:"Fukuoka",country:"Japan",timezone:"Asia/Tokyo",emoji:"🇯🇵"},
    {city:"Nagoya",country:"Japan",timezone:"Asia/Tokyo",emoji:"🇯🇵"},
    {city:"Seoul",country:"South Korea",timezone:"Asia/Seoul",emoji:"🇰🇷"},
    {city:"Busan",country:"South Korea",timezone:"Asia/Seoul",emoji:"🇰🇷"},
    {city:"Incheon",country:"South Korea",timezone:"Asia/Seoul",emoji:"🇰🇷"},
    {city:"Daegu",country:"South Korea",timezone:"Asia/Seoul",emoji:"🇰🇷"},
    {city:"Beijing",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Shanghai",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Guangzhou",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Shenzhen",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Chengdu",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Wuhan",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Nanjing",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Xi'an",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Hangzhou",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Chongqing",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Suzhou",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Lhasa",country:"China",timezone:"Asia/Shanghai",emoji:"🇨🇳"},
    {city:"Ürümqi",country:"China",timezone:"Asia/Urumqi",emoji:"🇨🇳"},
    {city:"Kashgar",country:"China",timezone:"Asia/Urumqi",emoji:"🇨🇳"},
    {city:"Hong Kong",country:"China",timezone:"Asia/Hong_Kong",emoji:"🇭🇰"},
    {city:"Macau",country:"China",timezone:"Asia/Macau",emoji:"🇲🇴"},
    {city:"Taipei",country:"Taiwan",timezone:"Asia/Taipei",emoji:"🇹🇼"},
    {city:"Kaohsiung",country:"Taiwan",timezone:"Asia/Taipei",emoji:"🇹🇼"},
    {city:"Ulaanbaatar",country:"Mongolia",timezone:"Asia/Ulaanbaatar",emoji:"🇲🇳"},
    {city:"Pyongyang",country:"North Korea",timezone:"Asia/Pyongyang",emoji:"🇰🇵"},

    // ── Southeast Asia ──
    {city:"Singapore",country:"Singapore",timezone:"Asia/Singapore",emoji:"🇸🇬"},
    {city:"Bangkok",country:"Thailand",timezone:"Asia/Bangkok",emoji:"🇹🇭"},
    {city:"Chiang Mai",country:"Thailand",timezone:"Asia/Bangkok",emoji:"🇹🇭"},
    {city:"Phuket",country:"Thailand",timezone:"Asia/Bangkok",emoji:"🇹🇭"},
    {city:"Kuala Lumpur",country:"Malaysia",timezone:"Asia/Kuala_Lumpur",emoji:"🇲🇾"},
    {city:"Penang",country:"Malaysia",timezone:"Asia/Kuala_Lumpur",emoji:"🇲🇾"},
    {city:"Jakarta",country:"Indonesia",timezone:"Asia/Jakarta",emoji:"🇮🇩"},
    {city:"Bali",country:"Indonesia",timezone:"Asia/Makassar",emoji:"🇮🇩"},
    {city:"Surabaya",country:"Indonesia",timezone:"Asia/Jakarta",emoji:"🇮🇩"},
    {city:"Medan",country:"Indonesia",timezone:"Asia/Jakarta",emoji:"🇮🇩"},
    {city:"Bandung",country:"Indonesia",timezone:"Asia/Jakarta",emoji:"🇮🇩"},
    {city:"Makassar",country:"Indonesia",timezone:"Asia/Makassar",emoji:"🇮🇩"},
    {city:"Manila",country:"Philippines",timezone:"Asia/Manila",emoji:"🇵🇭"},
    {city:"Cebu",country:"Philippines",timezone:"Asia/Manila",emoji:"🇵🇭"},
    {city:"Davao",country:"Philippines",timezone:"Asia/Manila",emoji:"🇵🇭"},
    {city:"Hanoi",country:"Vietnam",timezone:"Asia/Ho_Chi_Minh",emoji:"🇻🇳"},
    {city:"Ho Chi Minh City",country:"Vietnam",timezone:"Asia/Ho_Chi_Minh",emoji:"🇻🇳"},
    {city:"Yangon",country:"Myanmar",timezone:"Asia/Yangon",emoji:"🇲🇲"},
    {city:"Mandalay",country:"Myanmar",timezone:"Asia/Yangon",emoji:"🇲🇲"},
    {city:"Phnom Penh",country:"Cambodia",timezone:"Asia/Phnom_Penh",emoji:"🇰🇭"},
    {city:"Vientiane",country:"Laos",timezone:"Asia/Vientiane",emoji:"🇱🇦"},
    {city:"Bandar Seri Begawan",country:"Brunei",timezone:"Asia/Brunei",emoji:"🇧🇳"},
    {city:"Dili",country:"East Timor",timezone:"Asia/Dili",emoji:"🇹🇱"},

    // ── Oceania ──
    {city:"Sydney",country:"Australia",timezone:"Australia/Sydney",emoji:"🇦🇺"},
    {city:"Melbourne",country:"Australia",timezone:"Australia/Melbourne",emoji:"🇦🇺"},
    {city:"Brisbane",country:"Australia",timezone:"Australia/Brisbane",emoji:"🇦🇺"},
    {city:"Perth",country:"Australia",timezone:"Australia/Perth",emoji:"🇦🇺"},
    {city:"Adelaide",country:"Australia",timezone:"Australia/Adelaide",emoji:"🇦🇺"},
    {city:"Gold Coast",country:"Australia",timezone:"Australia/Brisbane",emoji:"🇦🇺"},
    {city:"Canberra",country:"Australia",timezone:"Australia/Sydney",emoji:"🇦🇺"},
    {city:"Darwin",country:"Australia",timezone:"Australia/Darwin",emoji:"🇦🇺"},
    {city:"Hobart",country:"Australia",timezone:"Australia/Hobart",emoji:"🇦🇺"},
    {city:"Newcastle",country:"Australia",timezone:"Australia/Sydney",emoji:"🇦🇺"},
    {city:"Geelong",country:"Australia",timezone:"Australia/Melbourne",emoji:"🇦🇺"},
    {city:"Cairns",country:"Australia",timezone:"Australia/Brisbane",emoji:"🇦🇺"},
    {city:"Townsville",country:"Australia",timezone:"Australia/Brisbane",emoji:"🇦🇺"},
    {city:"Launceston",country:"Australia",timezone:"Australia/Hobart",emoji:"🇦🇺"},
    {city:"Auckland",country:"New Zealand",timezone:"Pacific/Auckland",emoji:"🇳🇿"},
    {city:"Wellington",country:"New Zealand",timezone:"Pacific/Auckland",emoji:"🇳🇿"},
    {city:"Christchurch",country:"New Zealand",timezone:"Pacific/Auckland",emoji:"🇳🇿"},
    {city:"Queenstown",country:"New Zealand",timezone:"Pacific/Auckland",emoji:"🇳🇿"},
    {city:"Dunedin",country:"New Zealand",timezone:"Pacific/Auckland",emoji:"🇳🇿"},
    {city:"Suva",country:"Fiji",timezone:"Pacific/Fiji",emoji:"🇫🇯"},
    {city:"Lautoka",country:"Fiji",timezone:"Pacific/Fiji",emoji:"🇫🇯"},
    {city:"Port Moresby",country:"Papua New Guinea",timezone:"Pacific/Port_Moresby",emoji:"🇵🇬"},
    {city:"Nouméa",country:"New Caledonia",timezone:"Pacific/Noumea",emoji:"🇳🇨"},
    {city:"Apia",country:"Samoa",timezone:"Pacific/Apia",emoji:"🇼🇸"},
    {city:"Nuku'alofa",country:"Tonga",timezone:"Pacific/Tongatapu",emoji:"🇹🇴"},
    {city:"Tarawa",country:"Kiribati",timezone:"Pacific/Tarawa",emoji:"🇰🇮"},
    {city:"Funafuti",country:"Tuvalu",timezone:"Pacific/Funafuti",emoji:"🇹🇻"},
    {city:"Honiara",country:"Solomon Islands",timezone:"Pacific/Guadalcanal",emoji:"🇸🇧"},
    {city:"Port Vila",country:"Vanuatu",timezone:"Pacific/Efate",emoji:"🇻🇺"},
    {city:"Palikir",country:"Micronesia",timezone:"Pacific/Pohnpei",emoji:"🇫🇲"},
    {city:"Majuro",country:"Marshall Islands",timezone:"Pacific/Majuro",emoji:"🇲🇭"},
    {city:"Yaren",country:"Nauru",timezone:"Pacific/Nauru",emoji:"🇳🇷"},
    {city:"Papeete",country:"French Polynesia",timezone:"Pacific/Tahiti",emoji:"🇵🇫"},
    {city:"Pago Pago",country:"American Samoa",timezone:"Pacific/Pago_Pago",emoji:"🇦🇸"},
    {city:"Hagåtña",country:"Guam",timezone:"Pacific/Guam",emoji:"🇬🇺"},
    {city:"Saipan",country:"Northern Mariana Islands",timezone:"Pacific/Saipan",emoji:"🇲🇵"},
    {city:"Avarua",country:"Cook Islands",timezone:"Pacific/Rarotonga",emoji:"🇨🇰"},
    {city:"Alofi",country:"Niue",timezone:"Pacific/Niue",emoji:"🇳🇺"},
    {city:"Adamstown",country:"Pitcairn Islands",timezone:"Pacific/Pitcairn",emoji:"🇵🇳"},
    {city:"Mata-Utu",country:"Wallis and Futuna",timezone:"Pacific/Wallis",emoji:"🇼🇫"},
    {city:"Atafu",country:"Tokelau",timezone:"Pacific/Fakaofo",emoji:"🇹🇰"},

    // ── Siberian / Far East Russia ──
    {city:"Yekaterinburg",country:"Russia",timezone:"Asia/Yekaterinburg",emoji:"🇷🇺"},
    {city:"Chelyabinsk",country:"Russia",timezone:"Asia/Yekaterinburg",emoji:"🇷🇺"},
    {city:"Novosibirsk",country:"Russia",timezone:"Asia/Novosibirsk",emoji:"🇷🇺"},
    {city:"Omsk",country:"Russia",timezone:"Asia/Omsk",emoji:"🇷🇺"},
    {city:"Krasnoyarsk",country:"Russia",timezone:"Asia/Krasnoyarsk",emoji:"🇷🇺"},
    {city:"Irkutsk",country:"Russia",timezone:"Asia/Irkutsk",emoji:"🇷🇺"},
    {city:"Yakutsk",country:"Russia",timezone:"Asia/Yakutsk",emoji:"🇷🇺"},
    {city:"Vladivostok",country:"Russia",timezone:"Asia/Vladivostok",emoji:"🇷🇺"},
    {city:"Khabarovsk",country:"Russia",timezone:"Asia/Vladivostok",emoji:"🇷🇺"},
    {city:"Petropavlovsk-Kamchatsky",country:"Russia",timezone:"Asia/Kamchatka",emoji:"🇷🇺"},
    {city:"Magadan",country:"Russia",timezone:"Asia/Magadan",emoji:"🇷🇺"},
    {city:"Anadyr",country:"Russia",timezone:"Asia/Anadyr",emoji:"🇷🇺"},
    {city:"Norilsk",country:"Russia",timezone:"Asia/Krasnoyarsk",emoji:"🇷🇺"},

    // ── Remote / Atlantic ──
    {city:"Nuuk",country:"Greenland",timezone:"America/Nuuk",emoji:"🇬🇱"},
    {city:"Longyearbyen",country:"Svalbard",timezone:"Arctic/Longyearbyen",emoji:"🇸🇯"},
    {city:"Stanley",country:"Falkland Islands",timezone:"Atlantic/Stanley",emoji:"🇫🇰"},
    {city:"South Georgia",country:"South Georgia",timezone:"Atlantic/South_Georgia",emoji:"🇬🇸"},
    {city:"Diego Garcia",country:"British Indian Ocean Territory",timezone:"Indian/Chagos",emoji:"🇮🇴"},
    {city:"Hamilton",country:"Bermuda",timezone:"Atlantic/Bermuda",emoji:"🇧🇲"},
    {city:"Saint-Pierre",country:"Saint Pierre and Miquelon",timezone:"America/Miquelon",emoji:"🇵🇲"},

    // ── Additional Caribbean ──
    {city:"Road Town",country:"British Virgin Islands",timezone:"America/Tortola",emoji:"🇻🇬"},
    {city:"George Town",country:"Cayman Islands",timezone:"America/Cayman",emoji:"🇰🇾"},
    {city:"Oranjestad",country:"Aruba",timezone:"America/Aruba",emoji:"🇦🇼"},
    {city:"Willemstad",country:"Curaçao",timezone:"America/Curacao",emoji:"🇨🇼"},
    {city:"Kralendijk",country:"Bonaire",timezone:"America/Kralendijk",emoji:"🇧🇶"},
    {city:"Philipsburg",country:"Sint Maarten",timezone:"America/Lower_Princes",emoji:"🇸🇽"},
    {city:"Marigot",country:"Saint Martin",timezone:"America/Marigot",emoji:"🇲🇫"},
    {city:"Basseterre",country:"Saint Kitts and Nevis",timezone:"America/St_Kitts",emoji:"🇰🇳"},
    {city:"Saint John's",country:"Antigua and Barbuda",timezone:"America/Antigua",emoji:"🇦🇬"},
    {city:"Roseau",country:"Dominica",timezone:"America/Dominica",emoji:"🇩🇲"},
    {city:"Castries",country:"Saint Lucia",timezone:"America/St_Lucia",emoji:"🇱🇨"},
    {city:"Kingstown",country:"Saint Vincent",timezone:"America/St_Vincent",emoji:"🇻🇨"},
    {city:"Bridgetown",country:"Barbados",timezone:"America/Barbados",emoji:"🇧🇧"},
    {city:"St. George's",country:"Grenada",timezone:"America/Grenada",emoji:"🇬🇩"},
    {city:"Port of Spain",country:"Trinidad and Tobago",timezone:"America/Port_of_Spain",emoji:"🇹🇹"},
];

// ─── Config Helpers ────────────────────────────────────────────────────────────

function loadConfig(dataDir) {
    const configFile = path.join(dataDir, 'config.json');
    if (!fs.existsSync(configFile)) return {};
    try {
        return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (e) {
        log(`Error reading config: ${e.message}`);
        return {};
    }
}

function saveConfig(dataDir, config) {
    const configFile = path.join(dataDir, 'config.json');
    try {
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    } catch (e) {
        log(`Error saving config: ${e.message}`);
    }
}

function getFamguessrConfig(dataDir) {
    const config = loadConfig(dataDir);
    return config.famguessr || {
        enable: false,
        message_template: 'Hey it is {day}{time} in {city}, {country}, have you done your FamGuessr yet?',
        daily_send_time: null,
        daily_window_start: '06:00',
        daily_window_end: '12:00',
        last_send_date: null,
        last_place: null
    };
}
/**
 * Get current local time, day-of-week, and date for a given IANA timezone.
 * Uses JavaScript's Intl.DateTimeFormat — instant, offline, no network dependency.
 *
 * @param {string} tz — IANA timezone (e.g. "Asia/Kuala_Lumpur")
 * @returns {{ time: string, day: string|null, date: string }|null}
 */
function getLocalTimeAndDay(tz) {
    try {
        const d = new Date();
        const time = d.toLocaleTimeString('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
        const day = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
        const date = d.toLocaleDateString('sv', { timeZone: tz }).substring(0, 10); // 'sv' gives YYYY-MM-DD
        return { time, day, date };
    } catch (e) {
        log(`Timezone calculation error for ${tz}: ${e.message}`);
        return null;
    }
}

/**
 * Get today's date in America/New_York timezone as YYYY-MM-DD.
 */
function getNyDateString() {
    try {
        return new Date().toLocaleDateString('sv', { timeZone: 'America/New_York' }).substring(0, 10);
    } catch {
        return new Date().toISOString().substring(0, 10); // fallback to UTC
    }
}

/**
 * Get current day-of-week in New York (America/New_York).
 * Returns day name string ("Monday") or null on failure.
 */
function getNyDay() {
    try {
        return new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
    } catch {
        return null;
    }
}

// ─── Message Builder ──────────────────────────────────────────────────────────

/**
 * Build the notification message by interpolating a template.
 *
 * @param {object} place     — { city, country, timezone, emoji }
 * @param {object} localData — { time, day, date } from getLocalTimeAndDay (may be fallback)
 * @param {string|null} nyDay — current day-of-week in NY
 * @param {string} template  — user's message template with {time}, {city}, {country}, {day}
 * @returns {string} interpolated message
 */
function buildMessage(place, localData, nyDay, template) {
    let msg = template || 'Hey it is {day} {time} in {city}, {country}, have you done your FamGuessr yet?';

    // Always-replaced placeholders
    msg = msg.replace(/\{time\}/g, localData.time);
    msg = msg.replace(/\{city\}/g, place.city);
    msg = msg.replace(/\{country\}/g, place.country);

    // {day} is CONDITIONAL — only included when the local day != NY day
    // If we couldn't fetch NY day or local day, skip the day placeholder
    if (nyDay && localData.day && localData.day !== nyDay) {
        msg = msg.replace(/\{day\}/g, localData.day);
    } else {
        // Remove {day} and collapse surrounding whitespace
        msg = msg.replace(/\{day\}/g, '');
        msg = msg.replace(/\s{2,}/g, ' ').trim();
    }

    return msg;
}

// ─── Send Function ─────────────────────────────────────────────────────────────

/**
 * Pick a random city, fetch its local time, build the message, and send to ALL
 * notify_map entries via sendEmailSMS.
 *
 * @param {object} config    — full config object (must have email_sms, notify_map)
 * @param {string} dataDir   — path to data directory
 * @param {object} notifier  — { sendEmailSMS }
 * @param {boolean} isManual — true = manual send (don't clear daily_send_time)
 */
async function sendFamguessr(config, dataDir, notifier, isManual = false) {
    const fc = getFamguessrConfig(dataDir);
    if (!fc.enable && !isManual) {
        log('Famguessr is disabled. Skipping send.');
        return { success: false, error: 'Famguessr is disabled' };
    }

    // Pick random city
    const place = CITIES[Math.floor(Math.random() * CITIES.length)];
    log(`Selected: ${place.city}, ${place.country} (${place.timezone})`);

    // Get local time and NY day (synchronous, instant, uses Intl)
    const localData = getLocalTimeAndDay(place.timezone);
    const nyDay = getNyDay();

    // Fallback if Intl fails (shouldn't happen with valid timezone)
    let effectiveLocalData = localData;
    if (!localData) {
        effectiveLocalData = { time: '--:--', day: null, date: null };
    }

    // Build message
    const template = fc.message_template || 'Hey it is {day}{time} in {city}, {country}, have you done your FamGuessr yet?';
    const message = buildMessage(place, effectiveLocalData, nyDay, template);
    log(`Message: "${message}"`);

    // Send to all notify_map entries with phone numbers
    const notifyMap = config.notify_map || [];
    let sentCount = 0;
    const failures = [];

    for (const entry of notifyMap) {
        if (!entry.phone) {
            log(`Skipping ${entry.tag}: no phone number configured`);
            continue;
        }
        try {
            await notifier.sendEmailSMS(entry.phone, message, null, config.email_sms);
            sentCount++;
            log(`Sent to ${entry.tag} (${entry.phone})`);
        } catch (e) {
            const errMsg = `Failed to send to ${entry.tag} (${entry.phone}): ${e.message}`;
            log(errMsg);
            failures.push({ tag: entry.tag, error: e.message });
        }
    }

    // Update config: last_send_date, last_place, and (only for scheduled) clear daily_send_time
    const today = getNyDateString();
    const fullConfig = loadConfig(dataDir);
    fullConfig.famguessr = fullConfig.famguessr || {};
    fullConfig.famguessr.last_send_date = today;
    fullConfig.famguessr.last_place = {
        city: place.city,
        country: place.country,
        timezone: place.timezone,
        emoji: place.emoji
    };
    if (!isManual) {
        fullConfig.famguessr.daily_send_time = null;
    }
    saveConfig(dataDir, fullConfig);

    const result = {
        success: sentCount > 0,
        place: `${place.city}, ${place.country}`,
        message,
        sentCount,
        totalRecipients: notifyMap.filter(e => e.phone).length,
        failures: failures.length > 0 ? failures : undefined
    };

    log(`Done. Sent to ${sentCount} recipient(s).`);
    return result;
}

/**
 * Send Famguessr to a SINGLE specific tag (for testing).
 */
async function sendFamguessrToTag(config, tag, dataDir, notifier) {
    const fc = getFamguessrConfig(dataDir);

    // Pick random city
    const place = CITIES[Math.floor(Math.random() * CITIES.length)];
    log(`[test-${tag}] Selected: ${place.city}, ${place.country} (${place.timezone})`);

    // Get local time and NY day
    const localData = getLocalTimeAndDay(place.timezone);
    const nyDay = getNyDay();

    let effectiveLocalData = localData;
    if (!localData) {
        effectiveLocalData = { time: '--:--', day: null, date: null };
    }

    const template = fc.message_template || 'Hey it is {day}{time} in {city}, {country}, have you done your FamGuessr yet?';
    const message = buildMessage(place, effectiveLocalData, nyDay, template);

    // Find the matching tag entry
    const entry = (config.notify_map || []).find(m => m.tag === tag);
    if (!entry || !entry.phone) {
        log(`[test-${tag}] No phone number configured for ${tag}`);
        return { success: false, error: `No phone number configured for ${tag}` };
    }

    try {
        await notifier.sendEmailSMS(entry.phone, message, null, config.email_sms);
        log(`[test-${tag}] Sent to ${entry.tag} (${entry.phone})`);
        return { success: true, tag: entry.tag, phone: entry.phone, place: `${place.city}, ${place.country}`, message };
    } catch (e) {
        log(`[test-${tag}] Failed: ${e.message}`);
        return { success: false, error: e.message, tag: entry.tag, place: `${place.city}, ${place.country}`, message };
    }
}

// ─── Scheduler ─────────────────────────────────────────────────────────────────

let cronJob = null;

/**
 * Compute a random time in HH:MM format between given start and end bounds.
 * @param {string} start - HH:MM (e.g. "06:00")
 * @param {string} end   - HH:MM (e.g. "12:00")
 */
function randomDailyTime(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;
    // Handle overnight wraps (e.g. 22:00–02:00)
    const range = endMin > startMin ? endMin - startMin : (24 * 60) - startMin + endMin;
    const rand = Math.floor(Math.random() * range);
    const total = (startMin + rand) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Schedule the daily Famguessr job.
 *
 * On server start:
 * - If enabled and daily_send_time is unset: pick random time, store it, schedule cron.
 * - If enabled and daily_send_time exists: schedule at that stored time.
 * - If that stored time is today and already passed: send immediately, then clear for tomorrow.
 */
function setupScheduler(dataDir) {
    stopScheduler();

    const fc = getFamguessrConfig(dataDir);
    if (!fc.enable) {
        log('Famguessr disabled — no scheduler started.');
        return;
    }

    const today = getNyDateString();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const alreadySentToday = (fc.last_send_date === today);

    // Determine the send time
    const windowStart = fc.daily_window_start || '06:00';
    const windowEnd   = fc.daily_window_end   || '12:00';
    let sendTime = fc.daily_send_time;

    if (!sendTime) {
        // Generate a fresh random time within the configured window
        sendTime = randomDailyTime(windowStart, windowEnd);
        log(`Generated new send time: ${sendTime} (window ${windowStart}–${windowEnd})`);
        const fullConfig = loadConfig(dataDir);
        fullConfig.famguessr = fullConfig.famguessr || {};
        fullConfig.famguessr.daily_send_time = sendTime;
        saveConfig(dataDir, fullConfig);
    } else {
        // Validate stored time is within the current window; if not, regenerate
        const [sh, sm] = sendTime.split(':').map(Number);
        const [wsh, wsm] = windowStart.split(':').map(Number);
        const [weh, wem] = windowEnd.split(':').map(Number);
        const sendMins = sh * 60 + sm;
        const startMins = wsh * 60 + wsm;
        const endMins = weh * 60 + wem;
        const inWindow = endMins > startMins
            ? (sendMins >= startMins && sendMins < endMins)
            : (sendMins >= startMins || sendMins < endMins); // overnight wrap
        if (!inWindow) {
            const oldTime = sendTime;
            sendTime = randomDailyTime(windowStart, windowEnd);
            log(`Stored time ${oldTime} outside window ${windowStart}–${windowEnd} — regenerated to ${sendTime}`);
            const fullConfig = loadConfig(dataDir);
            fullConfig.famguessr = fullConfig.famguessr || {};
            fullConfig.famguessr.daily_send_time = sendTime;
            saveConfig(dataDir, fullConfig);
        } else {
            log(`Using stored send time: ${sendTime}`);
        }
    }

    const [sh, sm] = sendTime.split(':').map(Number);
    const sendMinutes = sh * 60 + sm;

    // If the time has already passed today AND we haven't sent yet, send immediately
    if (sendMinutes <= nowMinutes && !alreadySentToday) {
        log(`Scheduled time ${sendTime} already passed and no send today — sending now.`);
        const fullConfig = loadConfig(dataDir);
        const notifier = require('../notifier');
        sendFamguessr(fullConfig, dataDir, notifier, false).catch(e => {
            log(`Immediate send error: ${e.message}`);
        });
        // sendFamguessr clears daily_send_time, so next call to setupScheduler
        // will generate a fresh time for tomorrow. We intentionally do NOT
        // re-call setupScheduler here — the cron from the next server start
        // or the next enable toggle will handle it.
        log('Immediate send dispatched. Daily time cleared — next send will be tomorrow.');
        return;
    }

    // If already sent today OR time hasn't passed, schedule the cron
    // Cron pattern: minute hour * * * (node-cron runs every day at this time)
    const cronPattern = `${sm} ${sh} * * *`;
    log(`Scheduling Famguessr at cron: "${cronPattern}" (${sendTime} NY time)`);

    cronJob = cron.schedule(cronPattern, async () => {
        log('Cron fired — sending daily Famguessr...');
        try {
            const config = loadConfig(dataDir);
            const notifier = require('../notifier');

            // Double-check we haven't already sent today (e.g. manual send earlier)
            const fcNow = getFamguessrConfig(dataDir);
            if (fcNow.last_send_date === getNyDateString()) {
                log('Already sent today — skipping duplicate cron fire.');
                return;
            }

            await sendFamguessr(config, dataDir, notifier, false);
            log('Daily Famguessr sent successfully.');
        } catch (e) {
            log(`Scheduled send error: ${e.message}`);
        }
    }, {
        scheduled: true,
        timezone: 'America/New_York'
    });

    log('Famguessr scheduler started.');
}

/**
 * Stop and destroy the cron job (for disable).
 */
function stopScheduler() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        log('Famguessr scheduler stopped.');
    }
}

/**
 * Get current scheduler status for the UI.
 */
function getStatus(dataDir) {
    const fc = getFamguessrConfig(dataDir);
    const status = {
        enabled: fc.enable || false,
        nextSend: null,
        lastSend: fc.last_send_date || null,
        lastPlace: fc.last_place || null
    };

    if (fc.enable && fc.daily_send_time) {
        const [h, m] = fc.daily_send_time.split(':').map(Number);
        const now = new Date();
        const sendDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
        const today = getNyDateString();
        const todayDate = new Date(today + 'T00:00:00');
        if (sendDate <= now && fc.last_send_date !== today) {
            // Today's time passed but we haven't sent yet — immediate send pending
            status.nextSend = 'Sending...';
        } else if (sendDate <= now) {
            // Already sent today — next send is tomorrow
            sendDate.setDate(sendDate.getDate() + 1);
            status.nextSend = sendDate.toISOString();
        } else {
            status.nextSend = sendDate.toISOString();
        }
    }

    return status;
}

module.exports = {
    CITIES,
    getLocalTimeAndDay,
    getNyDay,
    getNyDateString,
    buildMessage,
    sendFamguessr,
    sendFamguessrToTag,
    setupScheduler,
    stopScheduler,
    getStatus,
    loadConfig,
    saveConfig,
    getFamguessrConfig,
    randomDailyTime
};
