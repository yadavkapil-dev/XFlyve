import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  fallbackAnswer,
  getAssistantAnswer,
  suggestedQuestions,
} from "./demoAssistantKnowledge";

const palette = {
  ink: "#0b1220",
  muted: "#697586",
  line: "rgba(15, 23, 42, 0.09)",
  panel: "rgba(255, 255, 255, 0.96)",
  heroStart: "#050b18",
  heroMid: "#0b2f3a",
  heroEnd: "#0c5f5b",
  teal: "#0e7c76",
};

const welcomeMessage = {
  role: "assistant",
  text:
    "Hi, I’m the XFlyve Demo Assistant. Ask me what the app does, how the logistics workflows work, what has been built, or what could be improved next.",
};

const DemoAssistant = () => {
  const { user } = useAuth();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const shouldLockPageScroll = useMediaQuery("(max-width:767px)");
  const inputRef = useRef(null);

  const publicAssistantPaths = ["/", "/login"];
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  const shouldShow = publicAssistantPaths.includes(normalizedPath) || Boolean(user);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([welcomeMessage]);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);

  const visibleSuggestions = useMemo(() => {
    const suggestionCount = isMobile ? (showMoreSuggestions ? 8 : 4) : 6;
    const offset = Math.floor(messages.length / 2) % suggestedQuestions.length;
    return Array.from({ length: suggestionCount }, (_, index) => (
      suggestedQuestions[(offset + index) % suggestedQuestions.length]
    ));
  }, [isMobile, messages.length, showMoreSuggestions]);

  useEffect(() => {
    if (!open || !shouldLockPageScroll) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, shouldLockPageScroll]);

  if (!shouldShow) return null;

  const askQuestion = (question) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmedQuestion },
      { role: "assistant", text: getAssistantAnswer(trimmedQuestion) },
    ]);
    setInput("");
    if (isMobile) setShowMoreSuggestions(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    askQuestion(input);
  };

  const resetConversation = () => {
    setMessages([welcomeMessage]);
    setInput("");
    setShowMoreSuggestions(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <Box
      sx={{
        position: "fixed",
        right: { xs: 14, sm: 22 },
        bottom: { xs: 14, sm: 22 },
        zIndex: (muiTheme) => muiTheme.zIndex.modal + 1,
        pointerEvents: "none",
      }}
    >
      {open && (
        <Paper
          elevation={0}
          sx={{
            pointerEvents: "auto",
            width: { xs: "94vw", sm: 390 },
            maxWidth: 430,
            height: { xs: "min(78vh, 620px)", sm: 560 },
            maxHeight: { xs: "78vh", sm: 560 },
            mb: { xs: 1, sm: 1.5 },
            overflow: "hidden",
            borderRadius: { xs: 3.5, sm: 5 },
            border: "1px solid",
            borderColor: alpha(palette.teal, 0.18),
            bgcolor: palette.panel,
            boxShadow: "0 28px 80px rgba(5, 11, 24, 0.24)",
            backdropFilter: "blur(18px)",
            display: "flex",
            flexDirection: "column",
            transform: open ? "translateY(0)" : "translateY(8px)",
            opacity: open ? 1 : 0,
            transition: "opacity 180ms ease, transform 180ms ease",
          }}
        >
          <Box
            sx={{
              p: { xs: 1.35, sm: 2 },
              color: "white",
              background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)`,
              flexShrink: 0,
            }}
          >
            <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
                <Box
                  sx={{
                    width: { xs: 34, sm: 40 },
                    height: { xs: 34, sm: 40 },
                    borderRadius: { xs: 2.5, sm: 3 },
                    display: "grid",
                    placeItems: "center",
                    bgcolor: alpha("#fff", 0.12),
                    border: "1px solid",
                    borderColor: alpha("#fff", 0.16),
                    flexShrink: 0,
                  }}
                >
                  <SmartToyOutlinedIcon />
                </Box>
                <Box minWidth={0}>
                  <Typography fontWeight={950} noWrap sx={{ fontSize: { xs: "0.92rem", sm: "1rem" } }}>XFlyve Demo Assistant</Typography>
                  <Typography variant="caption" sx={{ color: alpha("#fff", 0.68), fontSize: { xs: "0.68rem", sm: "0.75rem" } }}>
                    Local guide, no external AI calls
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Reset conversation">
                  <IconButton color="inherit" onClick={resetConversation} aria-label="reset demo assistant conversation">
                    <RestartAltRoundedIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close assistant">
                  <IconButton color="inherit" onClick={() => setOpen(false)} aria-label="close demo assistant">
                    <CloseRoundedIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ p: { xs: 1.25, sm: 2 }, overflowY: "auto", flex: 1, minHeight: 0 }}>
            <Stack spacing={1.25}>
              {messages.map((message, index) => {
                const isAssistant = message.role === "assistant";
                return (
                  <Box
                    key={`${message.role}-${index}`}
                    sx={{
                      alignSelf: isAssistant ? "flex-start" : "flex-end",
                      maxWidth: "92%",
                      px: { xs: 1.2, sm: 1.5 },
                      py: { xs: 0.9, sm: 1.15 },
                      borderRadius: { xs: 2.5, sm: 3 },
                      color: isAssistant ? palette.ink : "white",
                      bgcolor: isAssistant ? alpha(palette.teal, 0.08) : palette.teal,
                      border: "1px solid",
                      borderColor: isAssistant ? alpha(palette.teal, 0.14) : alpha(palette.teal, 0.28),
                    }}
                  >
                    <Typography variant="body2" sx={{ lineHeight: 1.5, fontSize: { xs: "0.82rem", sm: "0.875rem" } }}>
                      {message.text}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>

          </Box>

          <Box sx={{ px: { xs: 1.25, sm: 2 }, pb: { xs: 1, sm: 1.25 }, flexShrink: 0 }}>
            <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap">
              {visibleSuggestions.map((question) => (
                <Chip
                  key={question}
                  label={question}
                  clickable
                  onClick={() => askQuestion(question)}
                  sx={{
                    maxWidth: "100%",
                    color: palette.teal,
                    bgcolor: alpha(palette.teal, 0.08),
                    border: "1px solid",
                    borderColor: alpha(palette.teal, 0.16),
                    fontWeight: 800,
                    height: { xs: 28, sm: 32 },
                    fontSize: { xs: "0.72rem", sm: "0.8125rem" },
                  }}
                />
              ))}
              {isMobile && (
                <Chip
                  label={showMoreSuggestions ? "Show less" : "Show more"}
                  clickable
                  onClick={() => setShowMoreSuggestions((prev) => !prev)}
                  sx={{
                    height: 28,
                    color: palette.ink,
                    bgcolor: alpha(palette.ink, 0.06),
                    fontWeight: 850,
                    fontSize: "0.72rem",
                  }}
                />
              )}
            </Stack>

            {messages[messages.length - 1]?.text === fallbackAnswer && (
              <Typography variant="caption" sx={{ display: "block", mt: 1, color: palette.muted, fontSize: { xs: "0.68rem", sm: "0.75rem" } }}>
                Suggested topics are generated locally from a structured portfolio knowledge file.
              </Typography>
            )}
          </Box>

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ p: { xs: 1.1, sm: 1.5 }, borderTop: "1px solid", borderColor: palette.line, bgcolor: alpha("#fff", 0.82), flexShrink: 0 }}
          >
            <Stack direction="row" spacing={1}>
              <TextField
                inputRef={inputRef}
                size="small"
                fullWidth
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about XFlyve..."
                inputProps={{ "aria-label": "Ask the XFlyve Demo Assistant a question" }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    minHeight: { xs: 40, sm: 44 },
                    borderRadius: { xs: 2.5, sm: 3 },
                    bgcolor: "#fff",
                    fontSize: { xs: "0.84rem", sm: "0.875rem" },
                  },
                }}
              />
              <Tooltip title="Send">
                <span>
                  <IconButton
                    type="submit"
                    disabled={!input.trim()}
                    aria-label="send demo assistant question"
                    sx={{
                      width: { xs: 40, sm: 44 },
                      height: { xs: 40, sm: 44 },
                      borderRadius: { xs: 2.5, sm: 3 },
                      color: "white",
                      bgcolor: palette.teal,
                      "&:hover": { bgcolor: "#0b615d" },
                      "&.Mui-disabled": { bgcolor: alpha(palette.teal, 0.28), color: "white" },
                    }}
                  >
                    <SendRoundedIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Box>
        </Paper>
      )}

      <Tooltip title={open ? "Hide XFlyve Demo Assistant" : "Open XFlyve Demo Assistant"}>
        <Button
          variant="contained"
          onClick={() => setOpen((prev) => !prev)}
          startIcon={<AutoAwesomeOutlinedIcon />}
          sx={{
            pointerEvents: "auto",
            minHeight: { xs: 48, sm: 54 },
            borderRadius: 999,
            px: { xs: 2, sm: 2.25 },
            color: "white",
            bgcolor: palette.teal,
            textTransform: "none",
            fontWeight: 950,
            boxShadow: "0 18px 40px rgba(14, 124, 118, 0.28)",
            "&:hover": { bgcolor: "#0b615d", boxShadow: "0 22px 48px rgba(14, 124, 118, 0.34)" },
          }}
        >
          {isMobile ? "Demo" : "Demo Assistant"}
        </Button>
      </Tooltip>
    </Box>
  );
};

export default DemoAssistant;
