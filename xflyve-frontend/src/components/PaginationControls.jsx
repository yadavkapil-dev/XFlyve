import React from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// Shared pagination footer for admin list pages — page/limit come from the
// backend's { page, limit, total, totalPages } envelope (Phase 4).
const PaginationControls = ({ pagination, onPageChange, onLimitChange, palette }) => {
  if (!pagination) return null;

  const { page, limit, total, totalPages } = pagination;
  const line = palette?.line || "rgba(15, 23, 42, 0.075)";
  const muted = palette?.muted || "#697586";
  const ink = palette?.ink || "#0b1220";

  return (
    <Box
      sx={{
        mt: 2,
        p: 1.5,
        borderRadius: 4,
        border: "1px solid",
        borderColor: line,
        bgcolor: alpha("#fff", 0.72),
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.25,
      }}
    >
      <Typography variant="body2" sx={{ color: muted, fontWeight: 700 }}>
        {total} total · Page {page} of {Math.max(totalPages, 1)}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          select
          size="small"
          label="Per page"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          sx={{ minWidth: 100 }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <MenuItem key={size} value={size}>
              {size}
            </MenuItem>
          ))}
        </TextField>
        <Button
          size="small"
          variant="outlined"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          sx={{ borderRadius: 2, fontWeight: 800, color: ink }}
        >
          Prev
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          sx={{ borderRadius: 2, fontWeight: 800, color: ink }}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
};

export default PaginationControls;
