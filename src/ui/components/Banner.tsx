import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { useEffect, useState } from 'react';
import { logoLine, LOGO_SWEEP } from '../effects.js';
import { theme } from '../theme.js';

/** "TERMCHAT" in the ANSI Shadow figlet font (like keyrace's and termdrop's logo): 69 columns, 6 rows. */
export const LOGO = [
  '████████╗███████╗██████╗ ███╗   ███╗ ██████╗██╗  ██╗ █████╗ ████████╗',
  '╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██║  ██║██╔══██╗╚══██╔══╝',
  '   ██║   █████╗  ██████╔╝██╔████╔██║██║     ███████║███████║   ██║   ',
  '   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║     ██╔══██║██╔══██║   ██║   ',
  '   ██║   ███████╗██║  ██║██║ ╚═╝ ██║╚██████╗██║  ██║██║  ██║   ██║   ',
  '   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ',
];

/** Compact variant for narrow or short terminals: 33 columns, 2 rows. */
export const LOGO_SMALL = ['▀█▀ █▀▀ █▀█ █▀▄▀█ █▀▀ █ █ ▄▀█ ▀█▀', ' █  ██▄ █▀▄ █ ▀ █ █▄▄ █▀█ █▀█  █ '];

const LOGO_WIDTH = stringWidth(LOGO[0]!);

/** Big logo only where it fits comfortably (`height` = the chat list's rows). */
export function bannerCompact(width: number, height: number): boolean {
  return width < 80 || height < 22;
}

/** Rows the banner takes (logo, gap, tagline, gap). */
export function bannerHeight(compact: boolean): number {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 3;
}

/** A glint runs across the logo this often (while the chat list is in front). */
export const SHINE_EVERY = 6000;

/**
 * Plays a glint across the logo shortly after it appears and then every SHINE_EVERY ms.
 * Between glints nothing redraws; while `active` is false (terminal in the background, a
 * dialog open) it rests completely.
 */
function useShine(active: boolean, delay = 250): number {
  const [t, setT] = useState(-1);
  useEffect(() => {
    if (!active) {
      setT(-1);
      return;
    }
    let sweep: NodeJS.Timeout | null = null;
    let next: NodeJS.Timeout | null = null;
    const play = () => {
      const t0 = Date.now();
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < LOGO_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        next = setTimeout(play, SHINE_EVERY - LOGO_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, delay]);
  return t;
}

/** The chat list's eye-catcher: the logo and what termchat is. */
export function Banner({ width, compact, animate = true }: { width: number; compact: boolean; animate?: boolean }) {
  const t = useShine(animate);
  const logo = compact ? LOGO_SMALL : LOGO;
  const logoWidth = compact ? stringWidth(LOGO_SMALL[0]!) : LOGO_WIDTH;
  return (
    <Box flexDirection="column" width={width} alignItems="center" flexShrink={0}>
      {logo.map((line, i) => (
        <Text key={i}>{logoLine(line, i, logoWidth, theme.accent, t)}</Text>
      ))}
      <Text> </Text>
      <Text color={theme.faint} wrap="truncate-end">
        end-to-end encrypted chat for your local network
      </Text>
      <Text> </Text>
    </Box>
  );
}
