import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils"; // Assuming standard tailwind merge setup exists

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[14px] text-[15px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-offset-2 disabled:pointer-events-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-gradient-to-r from-[#D4AF37] to-[#B37A0B] text-black hover:from-[#E8C34B] hover:to-[#C78E1F] focus-visible:ring-[#D4AF37] border-transparent shadow-lg",
        secondary: "bg-white/10 border border-white/20 text-white hover:bg-white/20 focus-visible:ring-white/50 backdrop-blur-sm",
        outline: "border-2 border-white/30 text-white hover:bg-white/10 hover:border-white/50 focus-visible:ring-white/50",
        ghost: "bg-transparent text-white hover:bg-white/10 focus-visible:ring-white/30",
        success: "bg-gradient-to-r from-[#1E7B4F] to-[#165A39] text-white hover:from-[#25915D] hover:to-[#1B6F46] focus-visible:ring-[#1E7B4F] shadow-md",
        danger: "bg-gradient-to-r from-[#C62828] to-[#9E2020] text-white hover:from-[#D83636] hover:to-[#AD2626] focus-visible:ring-[#C62828] shadow-md",
      },
      size: {
        default: "h-12 px-6 py-3",
        compact: "h-11 px-4 py-2 text-sm",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  disabledReason?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, disabled, disabledReason, children, ...props }, ref) => {
    const isDisabled = disabled || isLoading;

    return (
      <div 
        className="inline-block" 
        title={isDisabled && disabledReason ? disabledReason : undefined}
      >
        <button
          className={cn(buttonVariants({ variant, size, className }), isDisabled && "opacity-60 saturate-50")}
          disabled={isDisabled}
          ref={ref}
          {...props}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {children}
        </button>
      </div>
    );
  }
);
Button.displayName = "Button";

