"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import confetti from "canvas-confetti";
import { sounds } from "@/lib/sound";
import { submitGameClearResult, getLocalHallOfFame, HallOfFameRecord } from "@/lib/sheets";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Power, 
  Trophy, 
  AlertTriangle, 
  Heart, 
  ArrowRight, 
  User, 
  Clock, 
  Target, 
  Volume2, 
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Medal,
  Crown
} from "lucide-react";

// 색상 정의 (파스텔 톤)
export const COLOR_CONFIG = {
  red: { name: "연한 빨강", hex: "#FF8A8A", border: "#FF5E5E", isTarget: true },
  orange: { name: "연한 주황", hex: "#FFD199", border: "#FFA858", isTarget: false },
  yellow: { name: "연한 노랑", hex: "#FFF099", border: "#FFDF4D", isTarget: false },
  green: { name: "연한 녹색", hex: "#B8E994", border: "#78E08F", isTarget: false },
  blue: { name: "연한 파랑", hex: "#A0D8EF", border: "#68C3EB", isTarget: false },
  purple: { name: "연한 보라", hex: "#DEC8EE", border: "#C39BD3", isTarget: false },
} as const;

type ColorKey = keyof typeof COLOR_CONFIG;

interface Brick {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  colorKey: ColorKey;
  isTarget: boolean;
  intact: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

export default function BrickBreakerGame() {
  // 화면 단계: "NAME_INPUT" | "GAME"
  const [screen, setScreen] = useState<"NAME_INPUT" | "GAME">("NAME_INPUT");
  const [playerName, setPlayerName] = useState("");
  const [tempName, setTempName] = useState("");

  // 게임 상태: "COUNTDOWN" | "PLAYING" | "PAUSED" | "VICTORY" | "GAMEOVER" | "STOPPED"
  const [gameState, setGameState] = useState<"COUNTDOWN" | "PLAYING" | "PAUSED" | "VICTORY" | "GAMEOVER" | "STOPPED">("COUNTDOWN");

  // 게임 변수
  const [lives, setLives] = useState(3);
  const [countdown, setCountdown] = useState<number | string>(3);
  const [elapsedTime, setElapsedTime] = useState(0);
  const elapsedTimeRef = useRef(0);
  const [redBricksDestroyed, setRedBricksDestroyed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameRecord[]>([]);
  const [isHofLoading, setIsHofLoading] = useState(false);

  // 캔버스 및 오디오 레퍼런스
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // 내부 물리 엔티티 레퍼런스
  const paddleRef = useRef({ x: 350, y: 540, w: 110, h: 14, speed: 7.5 });
  const ballRef = useRef({ x: 400, y: 520, vx: 4, vy: -4, radius: 8 });
  const bricksRef = useRef<Brick[]>([]);
  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const animFrameId = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchingRef = useRef(false);
  const isClearProcessedRef = useRef(false);

  // BGM 초기화 (볼륨 0.25)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const audio = new Audio("/Hyper_Speed_Run.mp3");
      audio.loop = true;
      audio.volume = 0.25;
      bgmRef.current = audio;
    }

    return () => {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current = null;
      }
    };
  }, []);

  // 게임 상태에 따른 BGM 재생 및 일시정지 제어
  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;

    if (screen === "GAME" && gameState === "PLAYING") {
      if (!isMuted) {
        bgm.play().catch(() => {});
      }
    } else {
      bgm.pause();
    }
  }, [screen, gameState, isMuted]);

  // 음소거 토글
  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (bgmRef.current) {
        if (next) {
          bgmRef.current.pause();
        } else if (screen === "GAME" && gameState === "PLAYING") {
          bgmRef.current.play().catch(() => {});
        }
      }
      return next;
    });
  };

  // 초기 벽돌 생성 (5행 x 8열 = 40개, 30% 연한 빨강)
  const initBricks = useCallback(() => {
    const rows = 5;
    const cols = 8;
    const padding = 10;
    const offsetTop = 60;
    const offsetLeft = 35;
    const brickW = 85;
    const brickH = 24;

    const list: Brick[] = [];
    const nonRedColors: ColorKey[] = ["orange", "yellow", "green", "blue", "purple"];
    
    const totalCount = rows * cols;
    const targetRedCount = Math.round(totalCount * 0.3); // 12개
    
    const colorArray: ColorKey[] = [];
    for (let i = 0; i < targetRedCount; i++) {
      colorArray.push("red");
    }
    for (let i = targetRedCount; i < totalCount; i++) {
      const randColor = nonRedColors[Math.floor(Math.random() * nonRedColors.length)];
      colorArray.push(randColor);
    }
    // Fisher-Yates 셔플
    for (let i = colorArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorArray[i], colorArray[j]] = [colorArray[j], colorArray[i]];
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const colorKey = colorArray[idx];
        const isTarget = colorKey === "red";

        list.push({
          id: idx,
          row: r,
          col: c,
          x: offsetLeft + c * (brickW + padding),
          y: offsetTop + r * (brickH + padding),
          w: brickW,
          h: brickH,
          colorKey,
          isTarget,
          intact: true,
        });
      }
    }

    bricksRef.current = list;
    setRedBricksDestroyed(0);
  }, []);

  // 공 & 패들 위치 리셋
  const resetBallAndPaddle = useCallback(() => {
    paddleRef.current = {
      x: 400 - 55,
      y: 540,
      w: 110,
      h: 14,
      speed: 7.5,
    };
    const angle = (Math.PI / 4) + (Math.random() * (Math.PI / 2));
    const speed = 5;
    ballRef.current = {
      x: 400,
      y: 520,
      vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      vy: -Math.abs(Math.sin(angle) * speed),
      radius: 8,
    };
  }, []);

  // 전체 게임 세션 시작
  const startNewGame = useCallback(() => {
    initBricks();
    resetBallAndPaddle();
    setLives(3);
    setElapsedTime(0);
    elapsedTimeRef.current = 0;
    isClearProcessedRef.current = false;
    setGameState("COUNTDOWN");
  }, [initBricks, resetBallAndPaddle]);

  // 카운트다운 타이머 (준비 3, 2, 1)
  useEffect(() => {
    if (screen !== "GAME") return;
    if (gameState !== "COUNTDOWN") return;

    let current = 3;
    setCountdown(current);
    sounds.playBeep(false);

    const interval = setInterval(() => {
      current--;
      if (current > 0) {
        setCountdown(current);
        sounds.playBeep(false);
      } else if (current === 0) {
        setCountdown("START!");
        sounds.playBeep(true);
      } else {
        clearInterval(interval);
        setGameState("PLAYING");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [screen, gameState]);

  // 게임 진행 중 타이머 측정
  useEffect(() => {
    if (gameState === "PLAYING") {
      timerIntervalRef.current = setInterval(() => {
        elapsedTimeRef.current += 1;
        setElapsedTime(elapsedTimeRef.current);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [gameState]);

  // PC 키보드 이벤트 (좌우 방향키)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") {
        keysRef.current.left = true;
        e.preventDefault();
      } else if (e.code === "ArrowRight") {
        keysRef.current.right = true;
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") {
        keysRef.current.left = false;
        e.preventDefault();
      } else if (e.code === "ArrowRight") {
        keysRef.current.right = false;
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 모바일 터치/드래그 또는 마우스 드래그 좌표 계산 함수
  const updatePaddleByClientX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const canvasX = (clientX - rect.left) * scaleX;
    const paddle = paddleRef.current;

    // 패들의 중심이 터치/커서 위치를 따라가도록 설정
    const newX = canvasX - paddle.w / 2;
    paddle.x = Math.max(0, Math.min(CANVAS_WIDTH - paddle.w, newX));
  }, []);

  // 캔버스 터치 이벤트 핸들러
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      isTouchingRef.current = true;
      updatePaddleByClientX(e.touches[0].clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isTouchingRef.current && e.touches.length > 0) {
      updatePaddleByClientX(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    isTouchingRef.current = false;
  };

  // 모바일/데스크톱 마우스 드래그 핸들러
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 좌클릭 상태이거나 마우스 이동 시 패들 추적 지원
    if (e.buttons === 1) {
      updatePaddleByClientX(e.clientX);
    }
  };

  // 온스크린 버튼 터치 제어 (길게 누르기 지원)
  const handleButtonControl = (dir: "left" | "right", active: boolean) => {
    if (dir === "left") {
      keysRef.current.left = active;
    } else {
      keysRef.current.right = active;
    }
  };

  // 폭죽 이펙트 트리거
  const triggerConfetti = () => {
    sounds.playVictory();
    const duration = 3.5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999 };

    const interval: NodeJS.Timeout = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }
      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: 0.15 + Math.random() * 0.7, y: Math.random() - 0.2 },
        colors: ["#FF8A8A", "#FFD199", "#FFF099", "#B8E994", "#A0D8EF", "#DEC8EE"]
      });
    }, 250);
  };

  // 게임 루프 (Canvas Rendering & Physics)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updatePhysics = () => {
      const paddle = paddleRef.current;
      const ball = ballRef.current;
      const bricks = bricksRef.current;

      // 1. 패들 이동 (방향키 또는 터치 버튼)
      if (keysRef.current.left) {
        paddle.x = Math.max(0, paddle.x - paddle.speed);
      }
      if (keysRef.current.right) {
        paddle.x = Math.min(CANVAS_WIDTH - paddle.w, paddle.x + paddle.speed);
      }

      if (gameState !== "PLAYING") return;

      // 2. 공 이동
      ball.x += ball.vx;
      ball.y += ball.vy;

      // 3. 벽 충돌 (좌, 우, 상)
      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.vx = -ball.vx;
      } else if (ball.x + ball.radius >= CANVAS_WIDTH) {
        ball.x = CANVAS_WIDTH - ball.radius;
        ball.vx = -ball.vx;
      }
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.vy = -ball.vy;
      }

      // 4. 패들 충돌
      if (
        ball.y + ball.radius >= paddle.y &&
        ball.y - ball.radius <= paddle.y + paddle.h &&
        ball.x >= paddle.x &&
        ball.x <= paddle.x + paddle.w &&
        ball.vy > 0
      ) {
        sounds.playPaddleHit();
        const hitPoint = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        const maxAngle = Math.PI / 3;
        const bounceAngle = hitPoint * maxAngle;
        const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        const speed = Math.max(5.5, Math.min(currentSpeed, 8));

        ball.vx = speed * Math.sin(bounceAngle);
        ball.vy = -speed * Math.cos(bounceAngle);
        ball.y = paddle.y - ball.radius - 1;
      }

      // 5. 바닥으로 떨어진 경우 (생명 감소)
      if (ball.y - ball.radius > CANVAS_HEIGHT) {
        sounds.playLifeLost();
        setLives((prevLives) => {
          const nextLives = prevLives - 1;
          if (nextLives <= 0) {
            setGameState("GAMEOVER");
          } else {
            resetBallAndPaddle();
          }
          return nextLives;
        });
        return;
      }

      // 6. 벽돌 충돌 검사
      for (let i = 0; i < bricks.length; i++) {
        const b = bricks[i];
        if (!b.intact) continue;

        if (
          ball.x + ball.radius > b.x &&
          ball.x - ball.radius < b.x + b.w &&
          ball.y + ball.radius > b.y &&
          ball.y - ball.radius < b.y + b.h
        ) {
          b.intact = false;
          sounds.playBrickHit(b.isTarget);

          const prevBallX = ball.x - ball.vx;
          const prevBallY = ball.y - ball.vy;

          if (prevBallX + ball.radius <= b.x || prevBallX - ball.radius >= b.x + b.w) {
            ball.vx = -ball.vx;
          } else {
            ball.vy = -ball.vy;
          }

          if (b.isTarget) {
            setRedBricksDestroyed((prev) => {
              const updated = prev + 1;
              if (updated >= 3 && !isClearProcessedRef.current) {
                isClearProcessedRef.current = true; // 단 한 번만 실행되도록 즉시 락 설정
                const currentSec = elapsedTimeRef.current;
                const finalTimeStr = formatTime(currentSec);
                
                setTimeout(() => {
                  setGameState("VICTORY");
                  triggerConfetti();
                  setIsHofLoading(true);

                  // 구글 시트에 저장 및 Hall of Fame TOP 3 갱신
                  submitGameClearResult(playerName, finalTimeStr).then((top3) => {
                    setHallOfFame(top3);
                    setIsHofLoading(false);
                  });
                }, 50);
              }
              return updated;
            });
          }
          break;
        }
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 배경
      const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGrad.addColorStop(0, "#0F172A");
      bgGrad.addColorStop(1, "#1E293B");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 격자 패턴
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_WIDTH; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_HEIGHT; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // 벽돌 렌더링
      bricksRef.current.forEach((b) => {
        if (!b.intact) return;

        const col = COLOR_CONFIG[b.colorKey];
        ctx.fillStyle = col.hex;
        ctx.strokeStyle = col.border;
        ctx.lineWidth = b.isTarget ? 2.5 : 1.5;

        const r = 5;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, r);
        ctx.fill();
        ctx.stroke();

        // 목표 블록(연한 빨강) 특별 강조
        if (b.isTarget) {
          ctx.fillStyle = "#FF2E2E";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("★ TARGET", b.x + b.w / 2, b.y + b.h / 2);
        }
      });

      // 패들 렌더링
      const paddle = paddleRef.current;
      const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
      paddleGrad.addColorStop(0, "#38BDF8");
      paddleGrad.addColorStop(1, "#0284C7");
      ctx.fillStyle = paddleGrad;
      ctx.shadowColor = "#38BDF8";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 7);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 공 렌더링
      const ball = ballRef.current;
      const ballGrad = ctx.createRadialGradient(
        ball.x - 2,
        ball.y - 2,
        1,
        ball.x,
        ball.y,
        ball.radius
      );
      ballGrad.addColorStop(0, "#FFFFFF");
      ballGrad.addColorStop(1, "#FCD34D");
      ctx.fillStyle = ballGrad;
      ctx.shadowColor = "#FCD34D";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const loop = () => {
      updatePhysics();
      render();
      animFrameId.current = requestAnimationFrame(loop);
    };

    animFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [gameState, resetBallAndPaddle]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    setPlayerName(tempName.trim());
    setScreen("GAME");
    startNewGame();
  };

  const handlePauseResume = () => {
    if (gameState === "PLAYING") {
      setGameState("PAUSED");
    } else if (gameState === "PAUSED") {
      setGameState("PLAYING");
    }
  };

  const handleRestart = () => {
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
    }
    setScreen("NAME_INPUT");
    setTempName("");
  };

  const handleQuit = () => {
    setGameState("STOPPED");
  };

  // 1. 첫 화면 (반응형 모바일 지원)
  if (screen === "NAME_INPUT") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-4 py-8 text-white font-sans">
        <div className="w-full max-w-md rounded-2xl bg-slate-900/85 p-6 sm:p-8 backdrop-blur-xl border border-blue-900/50 shadow-2xl relative overflow-hidden">
          
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* 마스코트 & 타이틀 */}
          <div className="text-center mb-6">
            <div className="relative mx-auto w-28 h-28 sm:w-32 sm:h-32 mb-4 rounded-2xl overflow-hidden border-2 border-blue-400/40 shadow-lg shadow-blue-500/20 bg-slate-800 flex items-center justify-center">
              <Image
                src="/Mascot.jpg"
                alt="INU 마스코트"
                fill
                priority
                className="object-cover"
              />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              <span className="text-blue-400">INU</span> 벽돌깨기
            </h1>
            
            <div className="mt-2.5 inline-block px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/30 text-xs font-semibold text-blue-300">
              물리학과 202400320 장원우
            </div>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                사용자 이름 입력
              </label>
              <input
                id="name"
                type="text"
                required
                maxLength={15}
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-base"
                autoFocus
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-rose-400" /> 게임 미션 안내
              </div>
              <p className="text-slate-400 leading-relaxed">
                <span className="text-rose-400 font-bold">연한 빨강 블록 3개</span>를 빠르게 제거하세요!
              </p>
              <div className="flex items-center gap-1 text-[11px] text-blue-300/90 pt-0.5">
                <Smartphone className="w-3.5 h-3.5" />
                <span>모바일: 화면 터치 드래그 또는 하단 좌우 버튼으로 조작</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!tempName.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 transition-all text-white active:scale-98 text-base cursor-pointer"
            >
              <span>게임 시작</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </main>
    );
  }

  // 2. 메인 게임 화면 (반응형 컨테이너)
  return (
    <main className="flex min-h-screen flex-col items-center justify-between sm:justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-2 py-3 sm:p-4 font-sans text-white select-none touch-none">
      <div className="w-full max-w-[800px] flex flex-col items-center">
        
        {/* 헤더 대시보드 (모바일 친화적 줄바꿈 및 간격) */}
        <div className="w-full mb-2.5 px-3 py-2 sm:px-5 sm:py-3 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-lg flex items-center justify-between gap-2">
          
          {/* 타이틀 및 플레이어 정보 */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border border-blue-400/40 shrink-0">
              <Image
                src="/Mascot.jpg"
                alt="마스코트"
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-semibold text-blue-400 truncate">
                INU 벽돌깨기 <span className="hidden sm:inline text-slate-500 font-normal">| 물리학과 202400320 장원우</span>
              </div>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-bold text-white truncate">
                <User className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="truncate">{playerName}</span>
              </div>
            </div>
          </div>

          {/* 중앙: 시간 & 미션 현황 */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <div className="flex items-center gap-1 text-xs sm:text-sm bg-slate-800/80 px-2 sm:px-3 py-1 rounded-lg border border-slate-700">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono font-bold text-amber-300">
                {gameState === "GAMEOVER" ? "--:--" : formatTime(elapsedTime)}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/30 px-2 sm:px-3 py-1 rounded-lg">
              <Target className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[11px] sm:text-xs font-medium text-rose-200">빨강:</span>
              <span className="font-mono font-bold text-rose-400 text-xs sm:text-sm">
                {redBricksDestroyed}/3
              </span>
            </div>
          </div>

          {/* 우측: BGM 토글 & 생명 */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={toggleMute}
              title={isMuted ? "BGM 켜기" : "BGM 끄기"}
              className="p-1 sm:p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            </button>

            <div className="flex items-center gap-0.5 sm:gap-1">
              {[1, 2, 3].map((val) => (
                <Heart
                  key={val}
                  className={`w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300 ${
                    val <= lives
                      ? "text-rose-500 fill-rose-500 drop-shadow-[0_0_5px_rgba(244,63,94,0.7)]"
                      : "text-slate-700 fill-slate-800"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 캔버스 컨테이너 (종횡비 4:3 유지 및 100% 반응형) */}
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl bg-slate-900 touch-none">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseMove={handleMouseMove}
            className="w-full h-full block cursor-ew-resize"
          />

          {/* 터치 슬라이드 조작 유도 가이드라인 (카운트다운 중 표시) */}
          {gameState === "COUNTDOWN" && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
              <div className="text-7xl sm:text-8xl font-black text-white animate-bounce drop-shadow-[0_0_20px_rgba(255,255,255,0.6)]">
                {countdown}
              </div>
              <p className="mt-3 text-slate-300 font-medium text-sm sm:text-base text-center px-4">
                화면 터치 드래그 또는 방향키로 조작하세요!
              </p>
            </div>
          )}

          {/* 일시 정지 오버레이 */}
          {gameState === "PAUSED" && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center z-20 space-y-3 p-4">
              <div className="p-3 sm:p-4 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <Pause className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">게임 일시 정지</h2>
              <p className="text-slate-400 text-xs sm:text-sm">진행 중인 게임이 멈췄습니다.</p>
              <button
                onClick={handlePauseResume}
                className="mt-1 px-5 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-slate-950 transition-all text-sm shadow-lg shadow-amber-500/20"
              >
                계속 진행하기
              </button>
            </div>
          )}

          {/* 게임 승리 오버레이 (Hall of Fame TOP 3 포함) */}
          {gameState === "VICTORY" && (
            <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-md flex flex-col items-center justify-center z-20 p-4 text-center animate-fade-in overflow-y-auto">
              <div className="p-2.5 sm:p-3 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 mb-1.5 animate-bounce">
                <Trophy className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">🎉 미션 완료! 축하합니다 🎉</h2>
              <p className="text-emerald-200 text-xs sm:text-sm font-medium mt-0.5">
                연한 빨강 블록 3개를 모두 격파했습니다!
              </p>

              {/* 내 클리어 기록 */}
              <div className="my-2.5 px-4 py-2 rounded-xl bg-black/40 border border-emerald-500/30 flex items-center justify-around gap-6 w-full max-w-xs">
                <div className="text-left">
                  <div className="text-[10px] text-slate-400">플레이어</div>
                  <div className="text-sm font-bold text-white truncate max-w-[100px]">{playerName}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">소요 시간</div>
                  <div className="text-xl font-mono font-bold text-emerald-400">{formatTime(elapsedTime)}</div>
                </div>
              </div>

              {/* 🏆 Hall of Fame (명예의 전당 TOP 3) */}
              <div className="w-full max-w-sm rounded-xl bg-slate-900/90 border border-amber-500/30 p-3 shadow-lg shadow-black/40 my-1">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 px-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span>HALL OF FAME (TOP 3)</span>
                  </div>
                  <span className="text-[10px] text-slate-400">빠른 순위</span>
                </div>

                <div className="space-y-1.5">
                  {hallOfFame.length > 0 ? (
                    hallOfFame.slice(0, 3).map((item, index) => {
                      const rankColors = [
                        "bg-amber-500/10 border-amber-500/40 text-amber-300", // 1위 금
                        "bg-slate-300/10 border-slate-400/30 text-slate-200", // 2위 은
                        "bg-amber-800/20 border-amber-700/30 text-amber-500", // 3위 동
                      ];
                      const badgeColors = [
                        "bg-amber-400 text-slate-950",
                        "bg-slate-300 text-slate-950",
                        "bg-amber-600 text-white",
                      ];

                      return (
                        <div
                          key={index}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${rankColors[index] || "bg-slate-800/40 border-slate-700 text-slate-300"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${badgeColors[index] || "bg-slate-700 text-slate-300"}`}>
                              {index + 1}
                            </span>
                            <span className="font-semibold truncate max-w-[120px]">{item.name}</span>
                          </div>
                          <div className="font-mono font-bold text-emerald-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{item.finishtime}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-2 text-xs text-slate-400">
                      {isHofLoading ? "명예의 전당 랭킹 불러오는 중..." : "등록된 랭킹 기록이 없습니다."}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleRestart}
                className="mt-2.5 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold transition-all shadow-lg text-sm flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                다시 시작 (이름 화면)
              </button>
            </div>
          )}

          {/* 미션 실패 오버레이 */}
          {gameState === "GAMEOVER" && (
            <div className="absolute inset-0 bg-rose-950/85 backdrop-blur-md flex flex-col items-center justify-center z-20 p-4 text-center animate-fade-in">
              <div className="p-3 sm:p-4 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 mb-2">
                <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white">게임 미션 실패</h2>
              <p className="text-rose-200 mt-1 text-xs sm:text-sm">
                모든 생명을 소진하여 미션을 완수하지 못했습니다.
              </p>
              <div className="my-3 sm:my-4 p-3 rounded-xl bg-black/40 border border-rose-500/30 w-full max-w-xs">
                <div className="text-xs text-rose-300 font-semibold">미션 실패 알림</div>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  미션을 실패하여 시간을 측정하지 않습니다.
                </p>
              </div>
              <button
                onClick={handleRestart}
                className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold transition-all shadow-lg text-sm flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                다시 시작 (이름 화면)
              </button>
            </div>
          )}

          {/* 게임 강제 종료 오버레이 */}
          {gameState === "STOPPED" && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center z-20 p-4 text-center">
              <div className="p-3 rounded-full bg-slate-800 text-slate-400 border border-slate-700 mb-2">
                <Power className="w-10 h-10" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">게임이 종료되었습니다</h2>
              <button
                onClick={handleRestart}
                className="mt-4 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all flex items-center gap-2 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                처음부터 다시 시작
              </button>
            </div>
          )}
        </div>

        {/* 모바일 전용 온스크린 가상 조작 버튼 (손쉬운 터치) */}
        <div className="w-full grid grid-cols-2 gap-3 mt-3 sm:hidden">
          <button
            onTouchStart={(e) => { e.preventDefault(); handleButtonControl("left", true); }}
            onTouchEnd={(e) => { e.preventDefault(); handleButtonControl("left", false); }}
            onMouseDown={() => handleButtonControl("left", true)}
            onMouseUp={() => handleButtonControl("left", false)}
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800/90 active:bg-blue-600 active:scale-95 border border-slate-700 text-blue-400 font-bold shadow-lg touch-none"
          >
            <ChevronLeft className="w-6 h-6" />
            <span>왼쪽으로</span>
          </button>
          <button
            onTouchStart={(e) => { e.preventDefault(); handleButtonControl("right", true); }}
            onTouchEnd={(e) => { e.preventDefault(); handleButtonControl("right", false); }}
            onMouseDown={() => handleButtonControl("right", true)}
            onMouseUp={() => handleButtonControl("right", false)}
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800/90 active:bg-blue-600 active:scale-95 border border-slate-700 text-blue-400 font-bold shadow-lg touch-none"
          >
            <span>오른쪽으로</span>
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* 하단 제어 버튼 바 */}
        <div className="w-full mt-2.5 sm:mt-4 flex flex-wrap items-center justify-between gap-2 px-1">
          
          <div className="flex items-center gap-2">
            {/* 일시 정지 / 재개 버튼 */}
            <button
              onClick={handlePauseResume}
              disabled={gameState !== "PLAYING" && gameState !== "PAUSED"}
              className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 text-xs sm:text-sm font-semibold transition-all active:scale-95"
            >
              {gameState === "PAUSED" ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>재개</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>일시 정지</span>
                </>
              )}
            </button>

            {/* 다시 시작 버튼 */}
            <button
              onClick={handleRestart}
              className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs sm:text-sm font-semibold transition-all active:scale-95 text-blue-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>다시 시작</span>
            </button>

            {/* 게임 종료 버튼 */}
            <button
              onClick={handleQuit}
              disabled={gameState === "STOPPED" || gameState === "VICTORY" || gameState === "GAMEOVER"}
              className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-800 text-xs sm:text-sm font-semibold transition-all active:scale-95 text-rose-300 disabled:opacity-40"
            >
              <Power className="w-3.5 h-3.5" />
              <span>종료</span>
            </button>
          </div>

          {/* 컨트롤 안내 */}
          <div className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">←</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">→</kbd>
              <span>방향키 조작</span>
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="text-blue-300">화면 드래그/터치 지원</span>
          </div>

        </div>

      </div>
    </main>
  );
}
