import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ProjectPublic } from '../../shared/types';
import { BrandMark } from '../components/BrandMark';
import { Presenter } from '../components/presenter/Presenter';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useConfig } from '../lib/config';

/** What the client opens: the device mockup, view only, and no website address anywhere. */
export function SharePage() {
  const { token = '' } = useParams();
  const { config, error: configError } = useConfig();
  const [project, setProject] = useState<ProjectPublic | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ProjectPublic>(`/share/${token}`).then(setProject, (e: Error) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (project) document.title = project.name;
  }, [project]);

  if (error || configError) {
    return (
      <div className="grid h-full place-items-center bg-stage p-6 text-center">
        <div>
          <BrandMark className="mx-auto mb-4 size-11 text-lg" />
          <p className="font-semibold text-white">This prototype isn’t available</p>
          <p className="mt-1 text-sm text-white/50">The link may have been reset or switched off. Ask the person who shared it for a new one.</p>
        </div>
      </div>
    );
  }
  if (!project || !config) return <div className="grid h-full place-items-center bg-stage text-white/50"><Spinner /></div>;

  return (
    <Presenter
      token={token}
      proxyOrigin={config.proxyOrigin}
      isAdmin={false}
      name={project.name}
      defaultDevice={project.device}
      lockedDevice={project.lockDevice ? project.device : undefined}
      left={
        <>
          <BrandMark className="size-7 text-[13px]" />
          <span className="truncate text-sm font-semibold">{project.name}</span>
        </>
      }
    />
  );
}
