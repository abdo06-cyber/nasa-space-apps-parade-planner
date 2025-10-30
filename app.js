// app.js
const canvas = document.getElementById('globe-canvas');

// === SCENE & RENDERER ===
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ 
  canvas, 
  alpha: true, 
  antialias: true 
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

// === CAMERA ===
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  3000
);
camera.position.set(0, 0, 45);

// === RESIZE HANDLER ===
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// === SOLEIL (derrière à gauche) ===
const sunGeo = new THREE.SphereGeometry(15, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ 
  color: 0xffffff,
  emissive: 0xffdd44,
  emissiveIntensity: 1.0
});
const sun = new THREE.Mesh(sunGeo, sunMat);
sun.position.set(-60, 15, -80);
scene.add(sun);

// Halo du soleil
const sunHaloGeo = new THREE.SphereGeometry(20, 32, 32);
const sunHaloMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(1.0, 0.95, 0.7, 1.0) * intensity;
    }
  `,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true
});
const sunHalo = new THREE.Mesh(sunHaloGeo, sunHaloMat);
sunHalo.position.copy(sun.position);
scene.add(sunHalo);

// Effet de lumière supplémentaire
const sunGlowGeo = new THREE.SphereGeometry(25, 32, 32);
const sunGlowMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.9 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
      gl_FragColor = vec4(0.4, 0.6, 1.0, 0.6) * intensity;
    }
  `,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true
});
const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
sunGlow.position.copy(sun.position);
scene.add(sunGlow);

// === LUNE (derrière à droite) ===
const moonGeo = new THREE.SphereGeometry(5, 32, 32);
const moonMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
const moon = new THREE.Mesh(moonGeo, moonMat);
moon.position.set(40, 8, -60);
scene.add(moon);

// === EARTH (devant, au centre) ===
const earthGeo = new THREE.SphereGeometry(24, 64, 64);
const earthTex = new THREE.TextureLoader().load('images/earth.jpg', 
  function(texture) {
    console.log('Earth texture loaded successfully');
  },
  undefined,
  function(error) {
    console.log('Error loading earth texture, using default color');
  }
);
const earthMat = new THREE.MeshBasicMaterial({ 
  map: earthTex,
  color: 0x1e88e5
});
const earth = new THREE.Mesh(earthGeo, earthMat);
earth.position.set(0, 0, 0);
scene.add(earth);

// === ATMOSPHERE ===
const atmoGeo = new THREE.SphereGeometry(26.5, 32, 32);
const atmoMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
      gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
    }
  `,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true
});
const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
atmosphere.position.copy(earth.position);
scene.add(atmosphere);

// === STARS SHADER ===
const starVertexShader = `
  attribute float size;
  attribute float phase;
  attribute vec3 customColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uTime;
  uniform float uPixelRatio;

  void main() {
    vColor = customColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = length(mvPosition.xyz);
    float twinkle = 0.75 + 0.35 * sin(uTime * 1.5 + phase);
    vAlpha = twinkle;
    gl_PointSize = size * uPixelRatio * (500.0 / max(dist, 40.0)) * twinkle;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv) * 2.0;
    float core = 1.0 - smoothstep(0.0, 0.25, dist);
    float halo = 1.0 - smoothstep(0.15, 1.2, dist);
    float alpha = (core * 1.0 + halo * 0.6) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// === FONCTION CRÉATION COUCHE ÉTOILES ===
function createStarLayer({ count, radiusMin, radiusMax, sizeMin, sizeMax }) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2.0 * Math.PI * u;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = radiusMin + Math.random() * (radiusMax - radiusMin);

    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const t = Math.random();
    let cr = 1.0, cg = 1.0, cb = 1.0;
    if (t < 0.15) {
      cr = 0.7; cg = 0.85; cb = 1.0;
    } else if (t < 0.75) {
      cr = 1.0; cg = 1.0; cb = 1.0;
    } else if (t < 0.92) {
      cr = 1.0; cg = 0.95; cb = 0.75;
    } else {
      cr = 1.0; cg = 0.7; cb = 0.5;
    }
    colors[i * 3 + 0] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;

    sizes[i] = sizeMin + Math.pow(Math.random(), 1.5) * (sizeMax - sizeMin);
    phases[i] = Math.random() * Math.PI * 2.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
  });

  return { points: new THREE.Points(geo, mat), material: mat };
}

const nearStars = createStarLayer({
  count: 3000,
  radiusMin: 250,
  radiusMax: 500,
  sizeMin: 2.5,
  sizeMax: 6.0
});

const midStars = createStarLayer({
  count: 5000,
  radiusMin: 550,
  radiusMax: 1000,
  sizeMin: 1.8,
  sizeMax: 4.5
});

const farStars = createStarLayer({
  count: 8000,
  radiusMin: 1100,
  radiusMax: 2000,
  sizeMin: 1.0,
  sizeMax: 3.0
});

scene.add(nearStars.points, midStars.points, farStars.points);

// === ANIMATION LOOP ===
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  nearStars.material.uniforms.uTime.value = elapsed;
  midStars.material.uniforms.uTime.value = elapsed * 0.9;
  farStars.material.uniforms.uTime.value = elapsed * 0.75;

  nearStars.points.rotation.y += 0.0003;
  midStars.points.rotation.y += 0.0002;
  farStars.points.rotation.y += 0.0001;

  earth.rotation.y += 0.002;
  atmosphere.rotation.y += 0.002;
  
  moon.rotation.y += 0.001;
  sun.rotation.y += 0.0005;

  renderer.render(scene, camera);
}

animate();

// === GESTION DU BOUTON "LET'S GO" ===
const letsGoBtn = document.querySelector('.hero-cta');
letsGoBtn.addEventListener('click', () => {
  document.getElementById('form-section').style.display = 'block';
  document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
});

// === BASE DE DONNÉES DES LOCALISATIONS D'ESSAOUIRA ===
const essaouiraLocations = {
  // Plages
  "plage": { temp: 26, windSpeed: 25, activity: "beach" },
  "beach": { temp: 26, windSpeed: 25, activity: "beach" },
  "plage d'essaouira": { temp: 26, windSpeed: 25, activity: "beach" },
  "sidi kaouki": { temp: 25, windSpeed: 30, activity: "surfing" },
  "diabat": { temp: 26, windSpeed: 28, activity: "beach" },
  
  // Médina et centre-ville
  "medina": { temp: 27, windSpeed: 15, activity: "walking" },
  "médina": { temp: 27, windSpeed: 15, activity: "walking" },
  "médina d'essaouira": { temp: 27, windSpeed: 15, activity: "walking" },
  "place moulay hassan": { temp: 27, windSpeed: 15, activity: "walking" },
  "moulay hassan": { temp: 27, windSpeed: 15, activity: "walking" },
  "skala": { temp: 26, windSpeed: 20, activity: "sightseeing" },
  "skala de la ville": { temp: 26, windSpeed: 20, activity: "sightseeing" },
  "port": { temp: 26, windSpeed: 22, activity: "walking" },
  "port d'essaouira": { temp: 26, windSpeed: 22, activity: "walking" },
  
  // Quartiers
  "mellah": { temp: 27, windSpeed: 12, activity: "walking" },
  "kasbah": { temp: 27, windSpeed: 14, activity: "walking" },
  "bab doukkala": { temp: 27, windSpeed: 16, activity: "walking" },
  "bab marrakech": { temp: 27, windSpeed: 16, activity: "walking" },
  
  // Rues principales
  "avenue mohamed v": { temp: 27, windSpeed: 15, activity: "shopping" },
  "avenue de l'istiqlal": { temp: 27, windSpeed: 15, activity: "walking" },
  "rue mohamed el qory": { temp: 27, windSpeed: 14, activity: "shopping" },
  
  // Lieux touristiques
  "ile de mogador": { temp: 25, windSpeed: 30, activity: "boat tour" },
  "borj el berod": { temp: 26, windSpeed: 20, activity: "sightseeing" },
  "dar souiri": { temp: 27, windSpeed: 12, activity: "cultural" },
  "musée sidi mohamed ben abdallah": { temp: 27, windSpeed: 10, activity: "museum" }
};

// === FONCTION GEOCODING AVEC SUPPORT DES LOCALISATIONS D'ESSAOUIRA ===
async function getCityCoordinates(cityName) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MY_PARADE_PLANNER/1.0'
      }
    });
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    } else {
      throw new Error('City not found');
    }
  } catch (error) {
    throw new Error('Unable to find city coordinates');
  }
}

// === FONCTION POUR DÉTECTER LA LOCALISATION DANS ESSAOUIRA ===
function detectEssaouiraLocation(cityName) {
  const lowerCity = cityName.toLowerCase().trim();
  
  // Chercher dans la base de données des localisations
  for (const [location, data] of Object.entries(essaouiraLocations)) {
    if (lowerCity.includes(location)) {
      return { found: true, location: location, data: data };
    }
  }
  
  return { found: false };
}

// === GESTION DU FORMULAIRE ===
const weatherForm = document.getElementById('weather-form');
const loadingMessage = document.getElementById('loading-message');

weatherForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const cityName = document.getElementById('city').value.trim();
  const date = document.getElementById('date').value;
  const activity = document.getElementById('activity').value.trim();

  loadingMessage.style.display = 'block';

  try {
    const location = await getCityCoordinates(cityName);
    
    loadingMessage.style.display = 'none';
    showResultsSection();

    // Température fixe à 26°C
    const temp = 26;
    
    // Vérifier si c'est Essaouira
    const isEssaouira = cityName.toLowerCase().includes('essaouira') || 
                        location.displayName.toLowerCase().includes('essaouira');
    
    // Détecter la localisation spécifique dans Essaouira
    const essaouiraLocationData = detectEssaouiraLocation(cityName);
    
    showResultContent(
      location.displayName, 
      date, 
      activity, 
      temp, 
      isEssaouira,
      essaouiraLocationData
    );

  } catch (error) {
    loadingMessage.style.display = 'none';
    alert(`❌ Error: ${error.message}. Please check the city name and try again.`);
  }
});

function showResultsSection() {
  const formSection = document.getElementById('form-section');
  const resultsSection = document.getElementById('results-section');
  const body = document.body;

  formSection.style.display = 'none';
  resultsSection.style.display = 'block';
  body.classList.add('results-mode');
}

function showResultContent(locationName, date, activity, temp, isEssaouira, essaouiraLocationData) {
  const recommendation = generateRecommendations(
    temp, 
    activity, 
    isEssaouira, 
    locationName,
    essaouiraLocationData
  );
  const recoIcon = getRecommendationIcon(temp, activity, isEssaouira, essaouiraLocationData);

  // Si une localisation spécifique est détectée, l'afficher
  let displayLocation = locationName;
  if (essaouiraLocationData.found) {
    displayLocation = `${essaouiraLocationData.location.charAt(0).toUpperCase() + essaouiraLocationData.location.slice(1)}, Essaouira`;
  }

  document.getElementById('result-content').innerHTML = `
    <div class="forecast-layout">
      <div class="result-header">
        <div class="result-label">${displayLocation}</div>
        <div class="result-label">${date}</div>
      </div>
      <div class="result-body">
        <div class="left-col">
          <div class="result-card temperature">
            <div class="result-title">Température</div>
            <div class="result-main">${temp}°C</div>
          </div>
          <div class="result-card activity">
            <div class="result-title">Activité</div>
            <div class="result-main">${activity}</div>
          </div>
        </div>
        <div class="right-col">
          <div class="result-card recommendation">
            <div class="result-title">Recommandation</div>
            <div class="result-icon">${recoIcon}</div>
            <div class="result-details">${recommendation}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateRecommendations(temp, activity, isEssaouira, locationName, essaouiraLocationData) {
  const activityLower = activity.toLowerCase();
  
  // Recommandations pour localisations spécifiques d'Essaouira
  if (essaouiraLocationData.found) {
    const locData = essaouiraLocationData.data;
    const locName = essaouiraLocationData.location;
    
    if (activityLower.includes('swim') || activityLower.includes('swimming')) {
      if (locName.includes('plage') || locName.includes('beach') || locName.includes('sidi kaouki')) {
        return `The ${locName} has strong winds (${locData.windSpeed} km/h). Swimming is not recommended today. Consider visiting the medina or trying indoor activities.`;
      }
    }
    
    if (activityLower.includes('walk') || activityLower.includes('walking')) {
      if (locName.includes('medina') || locName.includes('moulay hassan')) {
        return `Perfect weather for walking in ${locName}! Temperature is ${temp}°C with light winds. Explore the souks and enjoy the local atmosphere. Best time: late afternoon.`;
      }
      if (locName.includes('skala') || locName.includes('port')) {
        return `Great spot for walking! ${locName} offers beautiful ocean views. Wind speed: ${locData.windSpeed} km/h. Bring a light jacket and camera!`;
      }
    }
    
    if (activityLower.includes('surf') || activityLower.includes('surfing')) {
      if (locName.includes('sidi kaouki') || locName.includes('plage')) {
        return `Excellent conditions for surfing at ${locName}! Wind speed: ${locData.windSpeed} km/h. Perfect waves today. Don't forget your wetsuit!`;
      }
    }
    
    return `At ${locName}, the temperature is ${temp}°C with winds at ${locData.windSpeed} km/h. Great weather for your activity!`;
  }
  
  // Recommandations générales pour Essaouira
  if (isEssaouira) {
    if (activityLower.includes('swim') || activityLower.includes('swimming') || 
        activityLower.includes('natation') || activityLower.includes('nager')) {
      return "I don't advise you to swim today, the weather in Essaouira is not favorable and not suitable for swimming. I advise you to go to the gym instead.";
    }
    
    if (activityLower.includes('walk') || activityLower.includes('walking') || 
        activityLower.includes('marche') || activityLower.includes('promenade')) {
      return "Walking is a great activity to do today, but don't go now, wait until the sun sets.";
    }
    
    if (activityLower.includes('surf') || activityLower.includes('surfing')) {
      return "Essaouira is known for its wind! Today is a perfect day for surfing and water sports. The wind conditions are excellent.";
    }
    
    return `The weather in Essaouira today is ${temp}°C. It's a great day for outdoor activities, but be prepared for wind!`;
  }
  
  // Recommandations pour autres villes
  let recos = `Pleasant weather (${temp}°C). `;

  if (activityLower.includes('swim') || activityLower.includes('swimming') || 
      activityLower.includes('natation')) {
    recos += 'Perfect temperature for swimming! Remember sunscreen and stay hydrated.';
  } else if (activityLower.includes('walk') || activityLower.includes('walking') || 
             activityLower.includes('marche') || activityLower.includes('hiking')) {
    recos += 'Perfect for walking! Comfortable shoes and water bottle recommended.';
  } else if (activityLower.includes('soccer') || activityLower.includes('football') || 
             activityLower.includes('foot') || activityLower.includes('sport')) {
    recos += 'Great weather for sports! Athletic wear and sufficient hydration recommended.';
  } else if (activityLower.includes('garden') || activityLower.includes('jardin') || 
             activityLower.includes('jardinage')) {
    recos += 'Ideal for gardening! Gardening gloves and sun protection recommended.';
  } else {
    recos += 'Enjoy your activity!';
  }

  return recos;
}

function getRecommendationIcon(temp, activity, isEssaouira, essaouiraLocationData) {
  const activityLower = activity.toLowerCase();
  
  // Icônes pour localisations spécifiques d'Essaouira
  if (essaouiraLocationData.found) {
    const locData = essaouiraLocationData.data;
    
    if (locData.activity === 'beach') return "🏖️";
    if (locData.activity === 'surfing') return "🏄";
    if (locData.activity === 'walking') return "🚶";
    if (locData.activity === 'sightseeing') return "📸";
    if (locData.activity === 'shopping') return "🛍️";
    if (locData.activity === 'cultural') return "🏛️";
    if (locData.activity === 'museum') return "🖼️";
  }
  
  // Icônes pour Essaouira général
  if (isEssaouira) {
    if (activityLower.includes('swim') || activityLower.includes('swimming')) {
      return "🏋️";
    }
    if (activityLower.includes('walk') || activityLower.includes('walking')) {
      return "🌅";
    }
    if (activityLower.includes('surf')) {
      return "🏄";
    }
    return "🌬️";
  }
  
  // Icônes générales
  if (activityLower.includes('swim') || activityLower.includes('swimming')) {
    return "🏊";
  }
  if (activityLower.includes('walk') || activityLower.includes('walking')) {
    return "🚶";
  }
  if (activityLower.includes('soccer') || activityLower.includes('football')) {
    return "⚽";
  }
  if (activityLower.includes('garden')) {
    return "🌱";
  }
  if (activityLower.includes('surf')) {
    return "🏄";
  }
  
  return "🌤️";
}

function goBackToForm() {
  const formSection = document.getElementById('form-section');
  const resultsSection = document.getElementById('results-section');
  const body = document.body;

  resultsSection.style.display = 'none';
  formSection.style.display = 'block';
  body.classList.remove('results-mode');

  formSection.scrollIntoView({ behavior: 'smooth' });
}
