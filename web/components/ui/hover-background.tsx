'use client';

import * as React from 'react';
import { HTMLMotionProps, motion, useMotionValue, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';

type HoverBackgroundProps = HTMLMotionProps<'div'> & {
  objectCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  children?: React.ReactNode;
  colors?: {
    background?: string;
    objects?: string[];
    glow?: string;
  };
};

function HoverBackground({ className, objectCount = 12, children, colors = {}, ...props }: HoverBackgroundProps) {
  const {
    background = 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
    objects = [
      'bg-cyan-400/20',
      'bg-purple-400/20',
      'bg-fuchsia-400/20',
      'bg-violet-400/20',
      'bg-blue-400/20',
      'bg-indigo-400/20',
    ],
    glow = 'shadow-cyan-400/50',
  } = colors;

  const [isHovered, setIsHovered] = React.useState(false);
  // Particle positions/delays, drawn fresh on each hover start (in the handler,
  // keeping render pure).
  const [particles, setParticles] = React.useState<{ left: number; top: number; delay: number }[]>([]);

  // Mouse position tracking for parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Spring animations for smooth parallax with slower exit
  const springX = useSpring(mouseX, {
    stiffness: 300,
    damping: 30,
    // Slower return to center when hover ends
    restSpeed: 0.1,
    restDelta: 0.1,
  });
  const springY = useSpring(mouseY, {
    stiffness: 300,
    damping: 30,
    restSpeed: 0.1,
    restDelta: 0.1,
  });

  // Random draws happen once (lazy state) so render stays pure; the objects
  // below are derived from them.
  const [seeds] = React.useState(() =>
    Array.from({ length: 12 }, () => ({
      shape: Math.random(),
      x: Math.random(),
      y: Math.random(),
      size: Math.random(),
      delay: Math.random(),
      floatDirection: Math.random(),
      breathDuration: Math.random(),
      parallaxStrength: Math.random(),
      baseRotation: Math.random(),
    })),
  );

  const animatedObjects = React.useMemo(
    () =>
      seeds.slice(0, objectCount).map((seed, i) => {
        const shape = seed.shape > 0.5 ? 'circle' : 'square';
        return {
          id: i,
          x: seed.x * 90 + 5, // 5-95% to avoid edges
          y: seed.y * 90 + 5,
          size: seed.size * 60 + 20, // 20-80px
          color: objects[i % objects.length],
          delay: seed.delay * 2,
          shape,
          floatDirection: seed.floatDirection > 0.5 ? 1 : -1,
          breathDuration: seed.breathDuration * 3 + 3, // 3-6 seconds
          parallaxStrength: seed.parallaxStrength * 0.5 + 0.3, // 0.3-0.8 for more varied parallax depth
          baseRotation: seed.baseRotation * 360, // Random starting rotation offset
        };
      }),
    [seeds, objectCount, objects],
  );

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isHovered) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate mouse position relative to center (-1 to 1)
    const x = (event.clientX - rect.left - centerX) / centerX;
    const y = (event.clientY - rect.top - centerY) / centerY;

    mouseX.set(x * 15); // Slightly reduced parallax range
    mouseY.set(y * 15);
  };

  const handleHoverStart = () => {
    setParticles(
      Array.from({ length: 20 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 2,
      })),
    );
    setIsHovered(true);
  };

  const handleHoverEnd = () => {
    setIsHovered(false);
    // Smooth return to center
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      data-slot="hover-background"
      className={cn('relative size-full overflow-hidden', background, className)}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
      onMouseMove={handleMouseMove}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      animate={{
        backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
      }}
      style={{
        backgroundSize: '200% 200%',
      }}
      {...props}
    >
      {/* Subtle ambient glow */}
      <motion.div
        className="absolute inset-0 bg-gradient-radial from-white/5 via-transparent to-transparent"
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Animated Objects */}
      {animatedObjects.map((obj) => (
        <motion.div
          key={obj.id}
          className={cn(
            'absolute backdrop-blur-sm border border-white/10',
            obj.color,
            obj.shape === 'circle' ? 'rounded-full' : 'rounded-lg rotate-45',
          )}
          style={{
            left: `${obj.x}%`,
            top: `${obj.y}%`,
            width: obj.size,
            height: obj.size,
            // Apply parallax with individual object strength
            x: springX.get() * obj.parallaxStrength,
            y: springY.get() * obj.parallaxStrength,
          }}
          initial={{
            scale: 0.6,
            opacity: 0.4,
            rotate: obj.baseRotation,
          }}
          animate={{
            // Default state animations - breathing with base rotation offset
            scale: [0.6, 0.8, 0.6],
            opacity: [0.4, 0.6, 0.4],
            rotate:
              obj.shape === 'circle'
                ? [obj.baseRotation, obj.baseRotation + 10, obj.baseRotation]
                : [obj.baseRotation, obj.baseRotation + 5, obj.baseRotation],
            y: [0, obj.floatDirection * 15, 0],
            x: [0, obj.floatDirection * 8, 0],
          }}
          transition={{
            duration: obj.breathDuration,
            delay: obj.delay,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatType: 'reverse',
          }}
          whileHover={{
            scale: 1.5,
            boxShadow: `0 0 30px ${glow.replace('shadow-', '').replace('/50', '')}`,
          }}
        />
      ))}

      {/* Floating Particles on Hover */}
      {isHovered && (
        <div className="absolute inset-0 pointer-events-none">
          {particles.map((particle, i) => (
            <motion.div
              key={`particle-${i}`}
              className="absolute w-1 h-1 bg-white/60 rounded-full"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1, 0],
                y: [0, -50, -100],
              }}
              transition={{
                duration: 3,
                delay: particle.delay,
                repeat: Infinity,
                ease: 'easeOut',
              }}
            />
          ))}
        </div>
      )}

      {/* Content Layer */}
      <div className="relative z-10 size-full">{children}</div>
    </motion.div>
  );
}

export { HoverBackground, type HoverBackgroundProps };
