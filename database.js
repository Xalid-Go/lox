import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'db.json');

const defaultMovies = [
  {
    id: '1',
    title: 'Sintel (2010)',
    description: 'Трогательная история девушки Синтел, разыскивающей своего верного друга — маленького дракончика. HLS-стриминг.',
    poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&w=400',
    url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    type: 'hls',
    rating: '8.4'
  },
  {
    id: '2',
    title: 'Tears of Steel (2012)',
    description: 'Научно-фантастический короткометражный фильм, сочетающий живую съемку и передовые VFX-эффекты. HLS-видео.',
    poster: 'https://images.unsplash.com/photo-1478720143033-6a972678ae30?auto=format&fit=crop&q=80&w=400',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    type: 'hls',
    rating: '7.9'
  },
  {
    id: '3',
    title: 'Big Buck Bunny (2008)',
    description: 'Забавные приключения добродушного лесного гиганта-кролика, решившего проучить лесных белок.',
    poster: 'https://images.unsplash.com/photo-1509281373149-e957c6296406?auto=format&fit=crop&q=80&w=400',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    type: 'mp4',
    rating: '8.1'
  },
  {
    id: '4',
    title: 'Elephant\'s Dream (2006)',
    description: 'Экспериментальный 3D-фильм, погружающий в сюрреалистический мир механизмов и фантазий.',
    poster: 'https://images.unsplash.com/photo-1542204172-e7052809f85e?auto=format&fit=crop&q=80&w=400',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    type: 'mp4',
    rating: '7.5'
  },
  {
    id: '5',
    title: 'Cosmos Laundromat (2015)',
    description: 'Анимационный шедевр о печальной овечке и таинственном торговце, путешествующем во времени.',
    poster: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=400',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    type: 'mp4',
    rating: '8.5'
  },
  {
    id: '6',
    title: 'Spring (2019)',
    description: 'Поэтичная история девочки-пастушки и ее собаки, сталкивающихся с древними духами.',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=400',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    type: 'mp4',
    rating: '8.2'
  },
  {
    id: '7',
    title: 'Caminandes 1: Llama Drama',
    description: 'Смешные приключения неуклюжей ламы в Патагонии, пытающейся преодолеть препятствия.',
    poster: 'https://images.unsplash.com/photo-1589182373814-118c7bc76ff8?auto=format&fit=crop&q=80&w=400',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    type: 'mp4',
    rating: '7.8'
  },
  {
    id: '8',
    title: 'Glass Half Full',
    description: 'Креативный проект о взаимодействии воды и стекла.',
    poster: 'https://images.unsplash.com/photo-1517409419515-dce1758c1404?auto=format&fit=crop&q=80&w=400',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    type: 'mp4',
    rating: '7.1'
  }
];

export async function initDb() {
  try {
    await fs.access(dbPath);
    console.log('Database file exists.');
  } catch (error) {
    console.log('Database file does not exist. Initializing...');
    const initialData = {
      admin: {
        username: 'admin',
        password: 'admin123'
      },
      catalog: defaultMovies
    };
    await saveData(initialData);
    console.log('Database initialized successfully with default admin credentials and catalog.');
  }
}

async function getData() {
  try {
    const rawData = await fs.readFile(dbPath, 'utf-8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Error reading database file:', error);
    return { admin: { username: 'admin', password: 'admin123' }, catalog: [] };
  }
}

async function saveData(data) {
  try {
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing database file:', error);
  }
}

export async function getCatalog() {
  const data = await getData();
  return data.catalog || [];
}

export async function addMovie(movie) {
  const data = await getData();
  if (!data.catalog) data.catalog = [];
  
  const newMovie = {
    id: Date.now().toString(),
    title: movie.title,
    description: movie.description || '',
    poster: movie.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=400',
    url: movie.url,
    type: movie.type || 'hls',
    rating: movie.rating || '0.0'
  };
  
  data.catalog.push(newMovie);
  await saveData(data);
  return newMovie;
}

export async function deleteMovie(id) {
  const data = await getData();
  if (!data.catalog) return false;
  
  const initialLength = data.catalog.length;
  data.catalog = data.catalog.filter(movie => movie.id !== id);
  
  if (data.catalog.length === initialLength) return false;
  
  await saveData(data);
  return true;
}

export async function getAdminCredentials() {
  const data = await getData();
  return data.admin || { username: 'admin', password: 'admin123' };
}

export async function updateAdminCredentials(username, password) {
  const data = await getData();
  data.admin = { username, password };
  await saveData(data);
  return true;
}
