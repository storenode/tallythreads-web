import type { BrandIcon } from "@/components/ui/BrandIcons";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
} from "@/components/ui/BrandIcons";

export interface SocialLink {
  icon: BrandIcon;
  /** Network name — used verbatim in the link's accessible name and tooltip. */
  label: string;
  href: string;
}

export const socialLinks: SocialLink[] = [
  {
    icon: LinkedInIcon,
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/tallythreads/",
  },
  {
    icon: InstagramIcon,
    label: "Instagram",
    href: "https://www.instagram.com/tallythreads.hq/",
  },
  {
    icon: FacebookIcon,
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61594371173055",
  },
];
