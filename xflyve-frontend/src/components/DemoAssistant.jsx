import React, { useMemo, useRef, useState } from "react";
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
  const inputRef = useRef(null);

  const publicAssistantPaths = ["/", "/login"];
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  const shouldShow = publicAssistantPaths.includes(normalizedPath) || Boolean(user);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([welcomeMessage]);

  const visibleSuggestions = useMemo(() => {
    const suggestionCount = isMobile ? 4 : 6;
    const offset = Math.floor(messages.length / 2) % suggestedQuestions.length;
    return Array.from({ length: suggestionCount }, (_, index) => (
      suggestedQuestions[(offset + index) % suggestedQuestions.length]
    ));
  }, [isMobile, messages.length]);

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
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    askQuestion(input);
  };

  const resetConversation = () => {
    setMessages([welcomeMessage]);
    setInput("");
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
            width: { xs: "calc(100vw - 28px)", sm: 390 },
            maxWidth: 430,
            height: { xs: "min(680px, calc(100vh - 96px))", sm: 560 },
            mb: 1.5,
            overflow: "hidden",
            borderRadius: { xs: 4, sm: 5 },
            border: "1px solid",
            borderColor: alpha(palette.teal, 0.18),
            bgcolor: palette.panel,
            boxShadow: "0 28px 80px rgba(5, 11, 24, 0.24)",
            backdropFilter: "blur(18px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              p: 2,
              color: "white",
              background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)`,
            }}
          >
            <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 3,
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
                  <Typography fontWeight={950} noWrap>XFlyve Demo Assistant</Typography>
                  <Typography variant="caption" sx={{ color: alpha("#fff", 0.68) }}>
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

          <Box sx={{ p: 2, overflowY: "auto", flex: 1 }}>
            <Stack spacing={1.25}>
              {messages.map((message, index) => {
                const isAssistant = message.role === "assistant";
                return (
                  <Box
                    key={`${message.role}-${index}`}
                    sx={{
                      alignSelf: isAssistant ? "flex-start" : "flex-end",
                      maxWidth: "92%",
                      px: 1.5,
                      py: 1.15,
                      borderRadius: 3,
                      color: isAssistant ? palette.ink : "white",
                      bgcolor: isAssistant ? alpha(palette.teal, 0.08) : palette.teal,
                      border: "1px solid",
                      borderColor: isAssistant ? alpha(palette.teal, 0.14) : alpha(palette.teal, 0.28),
                    }}
                  >
                    <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
                      {message.text}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>

            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
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
                  }}
                />
              ))}
            </Stack>

            {messages[messages.length - 1]?.text === fallbackAnswer && (
              <Typography variant="caption" sx={{ display: "block", mt: 1.25, color: palette.muted }}>
                Suggested topics are generated locally from a structured portfolio knowledge file.
              </Typography>
            )}
          </Box>

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ p: 1.5, borderTop: "1px solid", borderColor: palette.line, bgcolor: alpha("#fff", 0.82) }}
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
                    minHeight: 44,
                    borderRadius: 3,
                    bgcolor: "#fff",
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
                      width: 44,
                      height: 44,
                      borderRadius: 3,
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
            minHeight: 54,
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
