import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { CLIENT_IMPORT_TEMPLATE, PROGRAM_IMPORT_TEMPLATE, type ImportIssue } from '@spotter/core';
import { Banner, Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, SegmentedControl, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { isConfigured, readText, saveAndShare } from '@spotter/ui/platform';
import { exportBusiness, importClients, importPrograms, previewClients, previewPrograms } from '../src/platform/data';
import { useRole } from '../src/platform/team';

type Kind = 'clients' | 'programs';

/** Import and export (K-9): CSV import with a template, per-row validation and a preview; full export. Owner only. */
export default function DataScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { isOwner } = useRole();
  const [kind, setKind] = useState<Kind>('clients');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<'import' | 'export' | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />;

  if (!isOwner) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="Only the head coach can import or export the business’s data." />
      </Screen>
    );
  }

  const clientsPreview = kind === 'clients' && text ? previewClients(text) : null;
  const programsPreview = kind === 'programs' && text ? previewPrograms(text) : null;
  const issues: ImportIssue[] = clientsPreview?.issues ?? programsPreview?.issues ?? [];
  const parseError = clientsPreview?.parseError ?? programsPreview?.parseError ?? null;
  const validCount = clientsPreview ? clientsPreview.valid.length : programsPreview ? programsPreview.programs.length : 0;

  const pick = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    try {
      setText(await readText(res.assets[0].uri));
      setFileName(res.assets[0].name);
    } catch {
      setError('Couldn’t read that file. Save it as CSV (comma separated) and try again.');
    }
  };

  const doImport = async () => {
    setBusy('import');
    setProgress(0);
    setError(null);
    try {
      if (clientsPreview) {
        const r = await importClients(clientsPreview.valid, setProgress);
        toast({ message: `${r.invited} client${r.invited === 1 ? '' : 's'} ${isConfigured() ? 'invited' : 'added'}${r.failed.length ? `, ${r.failed.length} failed` : ''}.` });
        if (r.failed.length) setError(r.failed.map((f) => `${f.email}: ${f.message}`).join('\n'));
      } else if (programsPreview) {
        const n = await importPrograms(programsPreview.programs);
        toast({ message: `${n} program${n === 1 ? '' : 's'} added to your templates.` });
      }
      setText('');
      setFileName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import didn’t finish. Nothing after the error was imported.');
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    setBusy('export');
    try {
      const r = await exportBusiness();
      toast({ message: r.emailed ? 'Export ready. We’ve emailed you a download link.' : 'Export saved.' });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Export didn’t work. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const noun = kind === 'clients' ? 'client' : 'program';
  return (
    <Screen banner={error ? <Banner tone="error" message={error} /> : undefined}>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Import and export
        </Text>
        <Text color="ink2">Move clients and programs in from another tool, or take everything with you.</Text>
      </View>

      <SectionLabel>Import</SectionLabel>
      <View style={styles.body}>
        <SegmentedControl<Kind>
          label="What to import"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setText('');
            setFileName(null);
          }}
          options={[
            { value: 'clients', label: 'Clients' },
            { value: 'programs', label: 'Programs' },
          ]}
        />
        <Text variant="callout" color="ink2">
          {kind === 'clients'
            ? isConfigured()
              ? 'Each client gets an invite email. They appear under New once they accept.'
              : 'Demo: imported clients appear under New.'
            : 'Programs are added to your templates, ready to assign.'}
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button
              label="Get the template"
              kind="secondary"
              icon="download"
              onPress={() => void saveAndShare(`spotter-${kind}-template.csv`, kind === 'clients' ? CLIENT_IMPORT_TEMPLATE : PROGRAM_IMPORT_TEMPLATE, 'text/csv')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Choose CSV file" kind="secondary" icon="upload" onPress={() => void pick()} />
          </View>
        </View>
        <TextField
          label={fileName ? `From ${fileName}` : 'Or paste CSV here'}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setFileName(null);
          }}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={kind === 'clients' ? 'name,email,plan,start_date' : 'program,week,day,day_title,exercise,sets,reps_min,reps_max,load_kg'}
        />
      </View>

      {text ? (
        <>
          <SectionLabel>Preview</SectionLabel>
          {parseError ? <Text color="error" style={styles.body}>{parseError}</Text> : null}
          <ListRow
            title={`${validCount} ${noun}${validCount === 1 ? '' : 's'} ready to import`}
            subtitle={issues.length ? `${issues.length} problem${issues.length === 1 ? '' : 's'} below. Those rows will be skipped.` : 'No problems found.'}
            last={issues.length === 0}
          />
          {issues.slice(0, 20).map((iss, i) => (
            <ListRow
              key={`${iss.row}-${iss.column}-${i}`}
              title={`Row ${iss.row}${iss.column ? ` · ${iss.column}` : ''}`}
              reason={iss.message}
              last={i === Math.min(issues.length, 20) - 1}
            />
          ))}
          {issues.length > 20 ? <Text color="ink2" style={styles.body}>{issues.length - 20} more problems. Fix these first, then paste the file again.</Text> : null}
          <View style={styles.body}>
            <Button
              label={busy === 'import' && kind === 'clients' ? `Importing ${progress} of ${validCount}…` : `Import ${validCount} ${noun}${validCount === 1 ? '' : 's'}`}
              onPress={() => void doImport()}
              loading={busy === 'import' && kind === 'programs'}
              disabled={validCount === 0 || !!busy}
              disabledReason={validCount === 0 ? 'Nothing valid to import yet.' : undefined}
            />
          </View>
        </>
      ) : null}

      <SectionLabel>Export</SectionLabel>
      <View style={styles.body}>
        <Text color="ink2">Clients, logs, programs, check-ins and signed waivers, as CSV, JSON and PDFs. Yours to keep, any time.</Text>
        <Button label="Download everything" icon="archive" kind="secondary" onPress={() => void doExport()} loading={busy === 'export'} />
      </View>
      <View style={{ height: space[8], backgroundColor: colors.paper }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[3] },
  row: { flexDirection: 'row', gap: space[3], flexWrap: 'wrap' },
});
