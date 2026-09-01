'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './index.module.css';

type Props = {
  className?: string;
};

const TEXTURE_WIDTH = 768;
const TEXTURE_HEIGHT = 384;

const OCEAN_GRADIENT_STOPS: Array<[number, string]> = [
  [0, '#269ed3'],
  [0.48, '#0875ba'],
  [1, '#004d8f'],
];

const LAND_GRADIENT_STOPS: Array<[number, string]> = [
  [0, '#e2d39a'],
  [0.48, '#c69a5b'],
  [1, '#a8733f'],
];

// 簡略化した大陸の輪郭座標 [経度, 緯度]（正距円筒図法でCanvasに投影する）
const CONTINENTS: number[][][] = [
  // 北米
  [
    [-165, 68],
    [-155, 60],
    [-140, 55],
    [-130, 50],
    [-125, 42],
    [-120, 34],
    [-110, 25],
    [-97, 20],
    [-90, 18],
    [-85, 25],
    [-80, 30],
    [-75, 35],
    [-70, 42],
    [-65, 45],
    [-60, 50],
    [-70, 55],
    [-85, 60],
    [-95, 65],
    [-110, 70],
    [-130, 72],
    [-150, 72],
    [-165, 68],
  ],
  // 南米
  [
    [-80, 10],
    [-75, 5],
    [-70, -5],
    [-70, -18],
    [-72, -30],
    [-70, -40],
    [-68, -50],
    [-65, -55],
    [-58, -52],
    [-53, -35],
    [-48, -22],
    [-40, -10],
    [-50, 0],
    [-60, 8],
    [-70, 10],
    [-80, 10],
  ],
  // グリーンランド
  [
    [-55, 60],
    [-45, 60],
    [-25, 65],
    [-20, 75],
    [-30, 83],
    [-50, 80],
    [-58, 70],
    [-55, 60],
  ],
  // アフリカ
  [
    [-17, 15],
    [-17, 25],
    [-10, 32],
    [0, 37],
    [10, 37],
    [20, 32],
    [32, 30],
    [35, 20],
    [40, 10],
    [45, 0],
    [42, -15],
    [35, -25],
    [25, -34],
    [15, -30],
    [12, -18],
    [10, -5],
    [8, 5],
    [-5, 10],
    [-17, 15],
  ],
  // ユーラシア
  [
    [-10, 36],
    [-5, 42],
    [0, 50],
    [5, 58],
    [10, 65],
    [20, 70],
    [40, 72],
    [60, 73],
    [80, 75],
    [100, 73],
    [120, 70],
    [140, 65],
    [150, 55],
    [145, 45],
    [135, 35],
    [120, 25],
    [110, 18],
    [100, 10],
    [90, 12],
    [80, 10],
    [70, 15],
    [60, 20],
    [50, 25],
    [40, 30],
    [30, 32],
    [20, 38],
    [10, 40],
    [0, 38],
    [-10, 36],
  ],
  // オーストラリア
  [
    [113, -22],
    [120, -18],
    [130, -12],
    [140, -11],
    [145, -16],
    [150, -25],
    [150, -35],
    [142, -38],
    [135, -35],
    [125, -32],
    [115, -30],
    [113, -22],
  ],
  // マダガスカル
  [
    [43, -12],
    [47, -15],
    [50, -20],
    [47, -25],
    [44, -22],
    [43, -16],
    [43, -12],
  ],
];

const lonLatToXY = (lon: number, lat: number): [number, number] => {
  const x = ((lon + 180) / 360) * TEXTURE_WIDTH;
  const y = ((90 - lat) / 180) * TEXTURE_HEIGHT;
  return [x, y];
};

const createVerticalGradient = (ctx: CanvasRenderingContext2D, stops: Array<[number, string]>) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  return gradient;
};

const createEarthTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D context unavailable');
  }

  // 海：縦グラデーション
  ctx.fillStyle = createVerticalGradient(ctx, OCEAN_GRADIENT_STOPS);
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  // 大陸：縦グラデーション塗り + 海岸線ストローク
  ctx.fillStyle = createVerticalGradient(ctx, LAND_GRADIENT_STOPS);
  ctx.strokeStyle = '#d5d19a88';
  ctx.lineWidth = 1.2;

  CONTINENTS.forEach((points) => {
    ctx.beginPath();
    points.forEach(([lon, lat], index) => {
      const [x, y] = lonLatToXY(lon, lat);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // 極地：上下の白い帯
  ctx.fillStyle = '#eef8ff';
  ctx.fillRect(0, 0, TEXTURE_WIDTH, 13);
  ctx.fillRect(0, TEXTURE_HEIGHT - 16, TEXTURE_WIDTH, 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const createCloudsTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D context unavailable');
  }

  ctx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = '#ffffff';

  const bands = 13;
  const perBand = 7;
  for (let band = 0; band < bands; band++) {
    const y = ((band + 0.5) / bands) * TEXTURE_HEIGHT;
    for (let i = 0; i < perBand; i++) {
      const seed = band * perBand + i;
      const x =
        (((seed * 53) % TEXTURE_WIDTH) + Math.sin(seed) * 40 + TEXTURE_WIDTH) % TEXTURE_WIDTH;
      const radiusX = 18 + (seed % 5) * 6;
      const radiusY = radiusX * (0.35 + (seed % 3) * 0.1);
      const rotation = (Math.cos(seed * 1.7) * Math.PI) / 3;
      const alpha = 0.12 + Math.abs(Math.sin(seed * 0.9)) * 0.25;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

export default function Earth3D({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let renderer: THREE.WebGLRenderer | undefined;
    let frameId = 0;
    let earthGeometry: THREE.SphereGeometry | undefined;
    let cloudsGeometry: THREE.SphereGeometry | undefined;
    let atmosphereGeometry: THREE.SphereGeometry | undefined;
    let earthMaterial: THREE.MeshPhongMaterial | undefined;
    let cloudsMaterial: THREE.MeshLambertMaterial | undefined;
    let atmosphereMaterial: THREE.MeshPhongMaterial | undefined;
    let earthTexture: THREE.CanvasTexture | undefined;
    let cloudsTexture: THREE.CanvasTexture | undefined;

    try {
      const isMobile = window.innerWidth < 600;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      camera.position.z = 3.45;

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(64, 64, false);
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      const group = new THREE.Group();
      group.rotation.z = THREE.MathUtils.degToRad(-23.4);
      scene.add(group);

      earthTexture = createEarthTexture();
      earthGeometry = new THREE.SphereGeometry(1.0, isMobile ? 36 : 56, isMobile ? 24 : 40);
      earthMaterial = new THREE.MeshPhongMaterial({
        map: earthTexture,
        emissive: '#073657',
        emissiveIntensity: 0.13,
        shininess: 30,
        specular: '#b8e8ff',
      });
      const earth = new THREE.Mesh(earthGeometry, earthMaterial);
      earth.rotation.y = -0.65;
      group.add(earth);

      cloudsTexture = createCloudsTexture();
      cloudsGeometry = new THREE.SphereGeometry(1.018, isMobile ? 34 : 48, isMobile ? 22 : 34);
      cloudsMaterial = new THREE.MeshLambertMaterial({
        map: cloudsTexture,
        transparent: true,
        depthWrite: false,
      });
      const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
      clouds.rotation.y = -0.4;
      group.add(clouds);

      atmosphereGeometry = new THREE.SphereGeometry(1.045, 44, 30);
      atmosphereMaterial = new THREE.MeshPhongMaterial({
        color: '#6dc8ff',
        transparent: true,
        opacity: 0.09,
        side: THREE.BackSide,
      });
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      group.add(atmosphere);

      const hemiLight = new THREE.HemisphereLight('#e8f7ff', '#07365c', 1.5);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight('#ffffff', 2.35);
      sunLight.position.set(-3, 2.7, 4);
      scene.add(sunLight);

      const rimLight = new THREE.DirectionalLight('#6ed2ff', 0.95);
      rimLight.position.set(3, -0.5, -2);
      scene.add(rimLight);

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const clock = new THREE.Clock();
      const activeRenderer = renderer;

      const tick = () => {
        const delta = Math.min(clock.getDelta(), 0.05);
        if (!reducedMotion.matches) {
          earth.rotation.y += delta * 0.19;
          clouds.rotation.y += delta * 0.225;
        }
        activeRenderer.render(scene, camera);
        frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);
    } catch (error) {
      console.error('[Earth3D] failed to initialize WebGL globe', error);
      setFailed(true);
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      earthGeometry?.dispose();
      cloudsGeometry?.dispose();
      atmosphereGeometry?.dispose();
      earthMaterial?.dispose();
      cloudsMaterial?.dispose();
      atmosphereMaterial?.dispose();
      earthTexture?.dispose();
      cloudsTexture?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, []);

  if (failed) {
    return (
      <div className={className} aria-hidden="true">
        <span className={styles.fallbackEmoji}>🌍</span>
      </div>
    );
  }

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
