import { Box, Text } from 'ink';
import type { Animations } from 'termcore/store/files';
import { Logo } from 'termcore/ui/components/Logo';
import { theme } from 'termcore/ui/theme';

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

/** Big logo only where it fits comfortably (`height` = the chat list's rows). */
export function bannerCompact(width: number, height: number): boolean {
  return width < 80 || height < 22;
}

/** Rows the banner takes (logo, gap, tagline, gap). */
export function bannerHeight(compact: boolean): number {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 3;
}

/** The chat list's eye-catcher: the logo and what termchat is. */
export function Banner({
  width,
  compact,
  animate = true,
  mode = 'brief',
}: {
  width: number;
  compact: boolean;
  animate?: boolean;
  /** animations from settings.json (/effects): the glint plays always, twice, or never */
  mode?: Animations;
}) {
  return (
    <Box flexDirection="column" width={width} alignItems="center" flexShrink={0}>
      <Logo lines={compact ? LOGO_SMALL : LOGO} animate={animate} mode={mode} />
      <Text> </Text>
      <Text color={theme.faint} wrap="truncate-end">
        end-to-end encrypted chat for your local network
      </Text>
      <Text> </Text>
    </Box>
  );
}
