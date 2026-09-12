import type { ResumeContent } from "./resume.functions";

function fileStem(name: string) {
  return (
    (name || "resume")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "resume"
  );
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadResumeDocx(content: ResumeContent) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    LevelFormat,
    Packer,
    Paragraph,
    TabStopPosition,
    TabStopType,
    TextRun,
  } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: content.fullName || "Resume", bold: true, size: 34 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: [content.headline, content.location, content.email].filter(Boolean).join("  |  "),
          size: 20,
          color: "4B5563",
        }),
      ],
    }),
  ];

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 180, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "16A34A", space: 4 } },
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 21 })],
    });

  /** Title on the left, dates right-aligned on the same baseline. */
  const entryLine = (title: string, dates: string) =>
    new Paragraph({
      spacing: { before: 100, after: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        new TextRun({ text: title, bold: true }),
        ...(dates ? [new TextRun({ text: `\t${dates}`, color: "4B5563" })] : []),
      ],
    });

  const bulletLine = (text: string) =>
    new Paragraph({
      numbering: { reference: "resume-bullets", level: 0 },
      spacing: { after: 35 },
      children: [new TextRun(text)],
    });

  if (content.summary) {
    children.push(heading("Summary"));
    children.push(
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun(content.summary)] }),
    );
  }

  if (content.experience.length) {
    children.push(heading("Experience"));
    content.experience.forEach((role) => {
      children.push(
        entryLine([role.title, role.company].filter(Boolean).join(" — "), role.dates ?? ""),
      );
      (role.bullets ?? []).forEach((bullet) => children.push(bulletLine(bullet)));
    });
  }

  if (content.projects?.length) {
    children.push(heading("Projects"));
    content.projects.forEach((project) => {
      children.push(
        entryLine([project.name, project.role].filter(Boolean).join(" — "), project.dates ?? ""),
      );
      if (project.link) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: project.link, color: "2563EB", size: 19 })],
          }),
        );
      }
      (project.bullets ?? []).forEach((bullet) => children.push(bulletLine(bullet)));
    });
  }

  if (content.education.length) {
    children.push(heading("Education"));
    content.education.forEach((item) =>
      children.push(
        entryLine([item.degree, item.school].filter(Boolean).join(" — "), item.dates ?? ""),
      ),
    );
  }

  if (content.skills.length) {
    children.push(heading("Skills"));
    children.push(new Paragraph({ children: [new TextRun(content.skills.join(", "))] }));
  }

  const document = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22, color: "111827" } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 21, bold: true, color: "111827" },
          paragraph: { outlineLevel: 0 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 420, hanging: 220 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12_240, height: 15_840 },
            margin: { top: 900, right: 1_080, bottom: 900, left: 1_080 },
          },
        },
        children,
      },
    ],
  });

  saveBlob(await Packer.toBlob(document), `${fileStem(content.fullName)}.docx`);
}

export async function downloadResumePdf(content: ResumeContent) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const left = 54;
  const right = 558;
  const center = (left + right) / 2;
  const bottom = 742;
  const top = 56;
  let y = top;

  const ensureSpace = (height: number) => {
    if (y + height <= bottom) return;
    pdf.addPage();
    y = top;
  };
  const wrap = (text: string, width: number) => pdf.splitTextToSize(text, width) as string[];

  /** Draws wrapped body text, paginating line by line so nothing is clipped. */
  const paragraph = (text: string, size = 10, indent = 0, bulletMark = "") => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    const lineHeight = size + 4;
    const lines = wrap(text, right - left - indent);
    lines.forEach((line, i) => {
      ensureSpace(lineHeight);
      if (bulletMark && i === 0) pdf.text(bulletMark, left + indent - 14, y);
      pdf.text(line, left + indent, y);
      y += lineHeight;
    });
    y += 3;
  };

  const section = (title: string) => {
    ensureSpace(40);
    y += 12;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(17, 24, 39);
    pdf.text(title.toUpperCase(), left, y);
    y += 6;
    pdf.setDrawColor(22, 163, 74);
    pdf.setLineWidth(1);
    pdf.line(left, y, right, y);
    y += 16;
  };

  /** Bold entry title on the left with the dates right-aligned and never overlapping. */
  const entryLine = (title: string, dates: string) => {
    ensureSpace(24);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    const datesWidth = dates ? pdf.getTextWidth(dates) + 12 : 0;
    pdf.setFont("helvetica", "bold");
    const titleLines = wrap(title, right - left - datesWidth);
    if (dates) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(75, 85, 99);
      pdf.text(dates, right, y, { align: "right" });
      pdf.setTextColor(17, 24, 39);
      pdf.setFont("helvetica", "bold");
    }
    titleLines.forEach((line, i) => {
      if (i > 0) ensureSpace(14);
      pdf.text(line, left, y);
      y += 14;
    });
    y += 2;
  };

  pdf.setProperties({
    title: `${content.fullName || "Candidate"} Resume`,
    author: content.fullName,
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(content.fullName || "Resume", center, y, { align: "center" });
  y += 20;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(75, 85, 99);
  pdf.setFontSize(9);
  const metaLines = wrap(
    [content.headline, content.location, content.email].filter(Boolean).join("  |  "),
    right - left,
  );
  metaLines.forEach((line) => {
    pdf.text(line, center, y, { align: "center" });
    y += 13;
  });
  y += 6;
  pdf.setTextColor(17, 24, 39);

  if (content.summary) {
    section("Summary");
    paragraph(content.summary);
  }

  if (content.experience.length) {
    section("Experience");
    content.experience.forEach((role) => {
      entryLine([role.title, role.company].filter(Boolean).join(" — "), role.dates ?? "");
      (role.bullets ?? []).forEach((bullet) => paragraph(bullet, 10, 18, "•"));
      y += 2;
    });
  }

  if (content.projects?.length) {
    section("Projects");
    content.projects.forEach((project) => {
      entryLine([project.name, project.role].filter(Boolean).join(" — "), project.dates ?? "");
      if (project.link) {
        pdf.setTextColor(37, 99, 235);
        paragraph(project.link, 9);
        pdf.setTextColor(17, 24, 39);
      }
      (project.bullets ?? []).forEach((bullet) => paragraph(bullet, 10, 18, "•"));
      y += 2;
    });
  }

  if (content.education.length) {
    section("Education");
    content.education.forEach((item) => {
      entryLine([item.degree, item.school].filter(Boolean).join(" — "), item.dates ?? "");
    });
  }

  if (content.skills.length) {
    section("Skills");
    paragraph(content.skills.join(", "));
  }

  pdf.save(`${fileStem(content.fullName)}.pdf`);
}
